export type PlusStatus = {available:boolean;active:boolean;paidUntil:number;cancelAtPeriodEnd:boolean;status:string};
export type PlusStatusView = {status:PlusStatus|null;signedOut:boolean;loading:boolean;error:string};

// Only the newest request may update the view, including after account changes.
export function createPlusStatusReader(fetcher:typeof fetch, apply:(view:PlusStatusView)=>void) {
  let generation=0;
  return {
    invalidate(){generation++;},
    async refresh() {
      const request=++generation;
      apply({status:null,signedOut:false,loading:true,error:''});
      try {
        const response=await fetcher('/api/musicbat/subscription',{cache:'no-store',credentials:'same-origin'});
        const data=await response.json() as PlusStatus & {error?:string};
        if(request!==generation)return;
        if(response.status===401){apply({status:null,signedOut:true,loading:false,error:''});return;}
        if(!response.ok)throw new Error(data.error??'Radio Plus status could not be loaded.');
        apply({status:data,signedOut:false,loading:false,error:''});
      }catch(error){
        if(request===generation)apply({status:null,signedOut:false,loading:false,error:error instanceof Error?error.message:'Radio Plus status could not be loaded.'});
      }
    },
  };
}
