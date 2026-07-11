export const SERVICE_WARNING_EVENT = "qixue:service-warning";

export function emitServiceWarning(message = "服务暂时不可用，请稍后重试或联系管理员。") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SERVICE_WARNING_EVENT, { detail: { message } }));
}
