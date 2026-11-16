export interface VapidConfig {subject:string;publicKey:string;privateKey:string;}
export function pushEndpoint(value:string):URL;
export function vapidAuthorization(endpoint:string,config:VapidConfig,now?:number):Promise<string>;
export function sendPush(endpoint:string,config:VapidConfig):Promise<void>;
