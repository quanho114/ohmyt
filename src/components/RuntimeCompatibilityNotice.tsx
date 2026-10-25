export function RuntimeCompatibilityNotice({message}:{message:string}){
  return <div role="alert" className="runtime-compatibility-notice"><p>{message}</p>
    {typeof window.electronAPI?.restart==='function'&&<button type="button" onClick={()=>window.electronAPI?.restart?.()}>Khởi động lại sky</button>}
  </div>;
}
