import {AsyncLocalStorage} from 'node:async_hooks';
export const registrationOwner=new AsyncLocalStorage();
export const toolOwners=new WeakMap();
