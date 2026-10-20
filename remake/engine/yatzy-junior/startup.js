/**
 * Bound one startup wait without abandoning its eventual rejection handler.
 * This does not cancel the underlying operation: its owner must pass the signal
 * to fetch/loaders and dispose resources that finish after startup was aborted.
 */
export function waitForStartup(promise,{signal,timeoutMs=0,optional=false}={}){
  const pending=Promise.resolve(promise);
  return new Promise((resolve,reject)=>{
    let settled=false,timer=null,listening=false;
    function finish(ok,value){
      if(settled)return;
      settled=true;
      if(timer!==null)clearTimeout(timer);
      if(listening){signal.removeEventListener('abort',abort);listening=false;}
      (ok?resolve:reject)(value);
    }
    function abort(){
      const reason=signal.reason===undefined?new DOMException('Startup was aborted','AbortError'):signal.reason;
      finish(false,reason);
    }
    // Attach both handlers even when the signal is already aborted. The loader
    // can still fail later, and that failure must never become unhandled.
    pending.then(value=>finish(true,value),error=>finish(false,error));
    if(signal?.aborted){abort();return;}
    if(signal){
      listening=true;signal.addEventListener('abort',abort,{once:true});
      if(signal.aborted){abort();return;}
    }
    if(!settled&&Number.isFinite(timeoutMs)&&timeoutMs>0){
      timer=setTimeout(()=>{
        if(optional){finish(true,undefined);return;}
        const error=new Error(`Startup timed out after ${timeoutMs} ms`);
        error.name='TimeoutError';finish(false,error);
      },timeoutMs);
    }
  });
}
