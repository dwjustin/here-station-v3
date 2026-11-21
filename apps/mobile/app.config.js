module.exports = ({ config }) => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) return config;

  const url = new URL(apiUrl);
  if (url.protocol !== 'http:') return config;

  // iOS 17+ requires an explicit exception for HTTP requests to IP addresses.
  const ats = config.ios.infoPlist.NSAppTransportSecurity ?? {};
  config.ios.infoPlist.NSAppTransportSecurity = {
    ...ats,
    NSExceptionDomains: {
      ...ats.NSExceptionDomains,
      [url.hostname]: { NSExceptionAllowsInsecureHTTPLoads: true },
    },
  };
  return config;
};
