export async function fetchWithGeminiRetry(url:string,init:RequestInit):Promise<{response:Response;retries:number}> {
  const retriesAllowed=2;
  const deadline=Date.now()+50_000;
  for(let attempt=0;attempt<=retriesAllowed;attempt++) {
    const remaining=deadline-Date.now();
    if(remaining<250)throw new DOMException("Gemini request timed out.","TimeoutError");
    const response=await fetch(url,{...init,signal:AbortSignal.timeout(remaining)});
    if(response.status!==503||attempt===retriesAllowed)return {response,retries:attempt};
    const retryAfter=Number(response.headers.get("retry-after"));
    await response.body?.cancel().catch(()=>undefined);
    const delay=Number.isFinite(retryAfter)&&retryAfter>0?Math.min(retryAfter*1000,3000):700*2**attempt;
    if(delay>=deadline-Date.now())throw new DOMException("Gemini request timed out.","TimeoutError");
    await new Promise(resolve=>setTimeout(resolve,delay));
  }
  throw new DOMException("Gemini request timed out.","TimeoutError");
}
