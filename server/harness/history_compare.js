import {isDeepStrictEqual} from 'node:util';

// Diagnostics contain positions/field names only, never chat text or tool secrets.
export function compareHistory({legacy,semantic}){
  const differences=[];
  for(let i=0;i<Math.max(legacy.length,semantic.length);i++){
    if(!legacy[i]||!semantic[i]){differences.push({index:i,field:'presence'});continue;}
    for(const field of new Set([...Object.keys(legacy[i]),...Object.keys(semantic[i])])){
      if(!isDeepStrictEqual(legacy[i][field],semantic[i][field]))differences.push({index:i,field});
    }
  }
  return {equal:differences.length===0,differences};
}
