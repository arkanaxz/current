export async function fetchWithGeminiRetry(url:string,init:RequestInit):Promise<{response:Response;attempts:number}> {
  const retries=2;
  for(let attempt=0;attempt<=retries;attempt++) {
    const response=await fetch(url,{...init,signal:AbortSignal.timeout(16_000)});
    if(response.status!==503||attempt===retries)return {response,attempts:attempt};
    const retryAfter=Number(response.headers.get("retry-after"));
    await response.body?.cancel().catch(()=>undefined);
    const delay=Number.isFinite(retryAfter)&&retryAfter>0?Math.min(retryAfter*1000,3000):700*2**attempt;
    await new Promise(resolve=>setTimeout(resolve,delay));
  }
  throw new Error("Gemini retry loop ended unexpectedly.");
}
