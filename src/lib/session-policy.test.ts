import { describe,it,expect } from 'vitest';
import { sessionLimits,offlineExpired,inactive } from './session-policy';
describe('Session policy',()=>{
 it('defaults to seven days offline and thirty minutes inactivity',()=>{expect(sessionLimits()).toEqual({offlineDays:7,inactivityMinutes:30});});
 it('expires on configured limits while keeping independent clocks',()=>{const policy={offlineDays:2,inactivityMinutes:5};expect(offlineExpired(0,2*86400000+1,policy)).toBe(true);expect(offlineExpired(0,86400000,policy)).toBe(false);expect(inactive(1000,301001,policy)).toBe(true);expect(inactive(1000,2000,policy)).toBe(false);});
});
