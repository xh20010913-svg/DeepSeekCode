export const referenceServicePath = "remoteManagedSettings/securityCheck.jsx";
export const serviceCompatibility = {
  "referencePath": "remoteManagedSettings/securityCheck.jsx",
  "domain": "remoteManagedSettings",
  "localTarget": "DeepSeekCode local runtime",
  "availability": "local-adapter",
  "cloudOnly": false,
  "note": "Reference service path is staged as a DeepSeekCode-owned compatibility adapter."
};
export function status() {
  return serviceCompatibility;
}
export function unsupported(operation = 'service call') {
  return {
    status: 'unsupported',
    referencePath: referenceServicePath,
    localTarget: serviceCompatibility.localTarget,
    message: operation + ' from ' + referenceServicePath + ' is present as a DeepSeekCode compatibility path.'
  };
}
export default { referenceServicePath, serviceCompatibility, status, unsupported };
