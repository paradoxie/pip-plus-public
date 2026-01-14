/**
 * PiP+ - Background Service Worker (Open Source)
 * https://github.com/paradoxie/pip-plus-public
 */

// 监听扩展安装
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('PiP+ installed');
  }
});

// 监听快捷键命令
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'toggle-pip' && tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'togglePiP' });
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }
});

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateBadge') {
    const tabId = sender.tab?.id;
    if (tabId) {
      const iconPath = message.hasVideo ? 'icons/icon' : 'icons/icon_gray';
      chrome.action.setIcon({
        tabId,
        path: {
          "16": `${iconPath}16.png`,
          "32": `${iconPath}32.png`,
          "48": `${iconPath}48.png`,
          "128": `${iconPath}128.png`
        }
      });
    }
    sendResponse({ success: true });
  }
  return true;
});

console.log('PiP+ Service Worker initialized');
