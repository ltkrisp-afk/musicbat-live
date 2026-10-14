/** Polls never block a listener's tune command; commands wait for in-flight authority. */
export function createRadioRequestQueue() {
  let tail:Promise<void>|null=null;
  return {
    run<T>(command:boolean,task:()=>Promise<T>):Promise<T|undefined> {
      if(!command&&tail)return Promise.resolve(undefined);
      const previous=tail;
      const result=(async()=>{if(previous)await previous;return task();})();
      const settled=result.then(()=>undefined,()=>undefined);
      tail=settled;
      void settled.then(()=>{if(tail===settled)tail=null;});
      return result;
    },
  };
}
