chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadImages') {
    (async () => {
      for (const url of message.urls) {
        try {
          await chrome.downloads.download({ url: url });
        } catch (e) {
          console.error('Failed to download', url, e);
        }
      }
    })();
    sendResponse({ status: 'started' });
  }
  return true;
});
