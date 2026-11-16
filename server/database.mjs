import { Pool, types } from 'pg';
// Match the application's JSON contract; PostgreSQL retains exact stored decimals.
types.setTypeParser(1700, (value) => Number(value));
types.setTypeParser(20, (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : value;
});

export const identifier = (value) => {
  if (typeof value !== 'string' || !/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('Invalid database identifier');
  return `"${value}"`;
};
export function field(value) {
  if (typeof value !== 'string' || !/^[a-z_][a-z0-9_]*(?:(?:->>|->)(?:[a-z_][a-z0-9_]*|[0-9]+))*$/.test(value))
    throw new Error('Invalid field');
  const [root, ...path] = value.split(/(->>|->)/);
  let sql = identifier(root);
  for (let i = 0; i < path.length; i += 2)
    sql += path[i] + (/^\d+$/.test(path[i + 1]) ? path[i + 1] : `'${path[i + 1]}'`);
  return sql;
}
export function createDatabase(connectionString) {
  const pool = new Pool({ connectionString, max: 6, idleTimeoutMillis: 30000 });
  async function transaction(identity, operation) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const role = identity?.service ? 'service_role' : identity?.id ? 'authenticated' : 'anon';
      await client.query(`set local role ${role}`);
      await client.query(
        "select set_config('request.jwt.claims',$1,true),set_config('statement_timeout','20000',true)",
        [JSON.stringify({ sub: identity?.id, role, aal: identity?.aal ?? 'aal1' })],
      );
      const result = await operation(client, role);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
  async function rpc(identity, name, args = {}) {
    identifier(name);
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid RPC arguments');
    const names = Object.keys(args);
    names.forEach(identifier);
    return transaction(identity, async (client, role) => {
      // Catalog AND role grants are authoritative; private/extension functions are never exposed.
      const allowed = await client.query(
        `select p.oid,p.proargnames,
    array(select t.typname::text from unnest(p.proargtypes) with ordinality a(type,position) join pg_type t on t.oid=a.type order by a.position) as types
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=$1 and p.prokind='f'
    and has_function_privilege($2,p.oid,'execute')
    and $3::text[] <@ coalesce(p.proargnames,'{}')
    and p.pronargs-p.pronargdefaults <= $4`,
        [name, role, names, names.length],
      );
      if (!allowed.rowCount) throw new Error('Function unavailable');
      const parameters = names.map((key, i) => `${identifier(key)} => $${i + 1}`).join(',');
      // to_jsonb handles scalar, composite and SETOF return types consistently.
      const fn = allowed.rows[0];
      const rows = await client.query(
        `select to_jsonb(r) as value from public.${identifier(name)}(${parameters}) r`,
        names.map((key) => {
          const type = fn.types[fn.proargnames.indexOf(key)];
          return ['json', 'jsonb'].includes(type) && args[key] !== null ? JSON.stringify(args[key]) : args[key];
        }),
      );
      const catalog = await client.query('select proretset from pg_proc where oid=$1', [allowed.rows[0].oid]);
      return catalog.rows[0].proretset ? rows.rows.map((row) => row.value) : (rows.rows[0]?.value ?? null);
    });
  }
  async function query(identity, { table, columns = '*', filters = [], order = [], offset = 0, limit = 1000, update }) {
    const target = `public.${identifier(table)}`;
    const fields = columns === '*' ? '*' : columns.split(',').map(identifier).join(',');
    if (!Array.isArray(filters) || filters.length > 30 || !Array.isArray(order) || order.length > 5)
      throw new Error('Invalid query');
    const values = [];
    const value = (val) => {
      values.push(val);
      return `$${values.length}`;
    };
    const where = filters.map(({ column, op, value: val }) => {
      const columnSql = field(column);
      if (op === 'eq') return `${columnSql} = ${value(val)}`;
      if (op === 'is' && val === null) return `${columnSql} is null`;
      if (op === 'ilike') return `${columnSql} ilike ${value(val)}`;
      if (op === 'in' && Array.isArray(val) && val.length <= 1000) return `${columnSql} = any(${value(val)})`;
      if (op === 'gte') return `${columnSql} >= ${value(val)}`;
      if (op === 'lt') return `${columnSql} < ${value(val)}`;
      if (op === 'nullOrEq') return `(${columnSql} is null or ${columnSql} = ${value(val)})`;
      throw new Error('Invalid query filter');
    });
    let sql;
    if (update) {
      if (!identity?.service) throw new Error('Direct writes forbidden');
      const assignments = Object.entries(update).map(([key, val]) => `${identifier(key)}=${value(val)}`);
      if (!assignments.length || !where.length) throw new Error('Unbounded update forbidden');
      sql = `update ${target} set ${assignments.join(',')} where ${where.join(' and ')} returning *`;
    } else {
      const sorting = order.map(
        ({ column, ascending = true }) => `${identifier(column)} ${ascending ? 'asc' : 'desc'}`,
      );
      sql = `select ${fields} from ${target}${where.length ? ' where ' + where.join(' and ') : ''}${sorting.length ? ' order by ' + sorting.join(',') : ''} limit ${value(Math.min(1000, Math.max(0, Number(limit) || 0)))} offset ${value(Math.max(0, Number(offset) || 0))}`;
    }
    return transaction(identity, async (client) => (await client.query(sql, values)).rows);
  }
  return { pool, transaction, rpc, query, close: () => pool.end() };
}

export function scopedClient(database, identity) {
  const result = async (operation) => {
    try {
      return { data: await operation(), error: null };
    } catch (error) {
      return { data: null, error };
    }
  };
  return {
    rpc: (name, args) => result(() => database.rpc(identity, name, args)),
    from(table) {
      const input = { table, filters: [], order: [] };
      let mode;
      const builder = {
        select(columns = '*') {
          input.columns = columns;
          return builder;
        },
        update(update) {
          input.update = update;
          return builder;
        },
        eq(column, value) {
          input.filters.push({ column, op: 'eq', value });
          return builder;
        },
        is(column, value) {
          input.filters.push({ column, op: 'is', value });
          return builder;
        },
        ilike(column, value) {
          input.filters.push({ column, op: 'ilike', value });
          return builder;
        },
        in(column, value) {
          input.filters.push({ column, op: 'in', value });
          return builder;
        },
        gte(column, value) {
          input.filters.push({ column, op: 'gte', value });
          return builder;
        },
        lt(column, value) {
          input.filters.push({ column, op: 'lt', value });
          return builder;
        },
        nullOrEq(column, value) {
          input.filters.push({ column, op: 'nullOrEq', value });
          return builder;
        },
        order(column, { ascending = true } = {}) {
          input.order.push({ column, ascending });
          return builder;
        },
        range(from, to) {
          input.offset = from;
          input.limit = to - from + 1;
          return builder;
        },
        limit(limit) {
          input.limit = limit;
          return builder;
        },
        single() {
          mode = 'single';
          return builder;
        },
        maybeSingle() {
          mode = 'maybe';
          return builder;
        },
        then(resolve, reject) {
          return result(async () => {
            const rows = await database.query(identity, input);
            if (mode) {
              if (rows.length > 1 || (mode === 'single' && !rows.length)) throw new Error('Expected one record');
              return rows[0] ?? null;
            }
            return rows;
          }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}
