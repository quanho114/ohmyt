export const USER_INPUT_RUNTIME_MESSAGE = 'Phần xử lý đang chạy bản cũ. Khởi động lại sky để dùng công cụ hỏi đáp trong chat; tải lại trang chưa đủ.';
export class RuntimeOutdatedError extends Error {
  constructor(){super(USER_INPUT_RUNTIME_MESSAGE);this.name='RuntimeOutdatedError';}
}
export function assertUserInputRuntime(value:{userInputVersion?:unknown}){
  if(value.userInputVersion!==1)throw new RuntimeOutdatedError();
}
export function isMissingUserInputEndpoint(status:number,endpoint:string,message:string){
  return status===404&&message.startsWith('Endpoint not found:')&&(
    /^\/sessions\/[^/]+\/user-input$/.test(endpoint)||/^\/runs\/[^/]+\/user-input\/[^/]+$/.test(endpoint)
  );
}
