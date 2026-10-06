import {test,expect} from '@playwright/test';
import {login,actor,rpc} from './fixtures';
test('manager dashboard filters and exported impact stay within cooperative scope',async({page})=>{
 await login(page,'manager1');await page.goto('/dashboards');
 await expect(page.locator('.metric-card')).toHaveCount(13);
 const select=page.getByLabel('Organization',{exact:true});
 await expect(select.locator('option')).toHaveCount(2);
 const response=page.waitForResponse(reply=>reply.url().includes('/rpc/impact_metrics_filtered'));
 await select.selectOption('10000000-0000-4000-8000-000000000001');await response;
 const download=page.waitForEvent('download');const report=page.waitForRequest(request=>request.url().endsWith('/functions/v1/report'));
 await page.getByRole('button',{name:/CSV.*CSV$/}).click();
 expect((await report).postDataJSON().cooperative_id).toBe('10000000-0000-4000-8000-000000000001');expect((await download).suggestedFilename()).toBe('wise-impact.csv');
 const manager=await actor('manager1');await expect(rpc(manager.c,'impact_metrics_filtered',{from_date:'2026-01-01',to_date:'2026-12-31',cooperative_filter:'10000000-0000-4000-8000-000000000002',region_filter:null})).rejects.toThrow(/scope/);
});
test('donor filters use safe cooperative metadata and preserve suppressed cells',async({page})=>{
 await login(page,'donor1');await page.goto('/dashboards');await expect(page.locator('.metric-card')).toHaveCount(9);
 const region=page.getByLabel('Region',{exact:true});await expect(region.locator('option')).toHaveCount(3);
 const response=page.waitForResponse(reply=>reply.url().includes('/rpc/impact_metrics_filtered'));
 await region.selectOption('Bekaa');const result=await (await response).json();expect(result.every((metric:{suppressed:boolean;value:unknown})=>metric.suppressed&&metric.value===null)).toBe(true);
 await expect(page.locator('.metric-card').first()).toContainText('Suppressed');
});
