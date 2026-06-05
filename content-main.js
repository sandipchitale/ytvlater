// Main World Content Script (runs in page context to access window.ytcfg)

console.log("YTVLater: Main-world script initialized.");

document.addEventListener("YTV_API_REQUEST", async (event) => {
  const { requestId, action, payload } = event.detail;
  try {
    const responseData = await handleApiRequest(action, payload);
    document.dispatchEvent(new CustomEvent("YTV_API_RESPONSE", {
      detail: { requestId, success: true, data: responseData }
    }));
  } catch (error) {
    console.error(`YTVLater API error on action ${action}:`, error);
    document.dispatchEvent(new CustomEvent("YTV_API_RESPONSE", {
      detail: { requestId, success: false, error: error.message }
    }));
  }
});

async function handleApiRequest(action, payload) {
  // Check if the user is logged into YouTube
  const isLoggedIn = window.ytcfg?.get?.("LOGGED_IN") || 
                     window.ytcfg?.data_?.LOGGED_IN || 
                     window.ytcfg?.data?.LOGGED_IN ||
                     window.yt?.config_?.LOGGED_IN;

  if (isLoggedIn === false) {
    throw new Error("You must be logged into your YouTube account to use YTVLater.");
  }

  // Extract InnerTube config parameters with multiple fallbacks
  const apiKey = window.ytcfg?.get?.("INNERTUBE_API_KEY") || 
                 window.ytcfg?.data_?.INNERTUBE_API_KEY || 
                 window.ytcfg?.data?.INNERTUBE_API_KEY ||
                 window.yt?.config_?.INNERTUBE_API_KEY;

  let context = window.ytcfg?.get?.("INNERTUBE_CONTEXT") || 
                window.ytcfg?.data_?.INNERTUBE_CONTEXT || 
                window.ytcfg?.data?.INNERTUBE_CONTEXT ||
                window.yt?.config_?.INNERTUBE_CONTEXT;

  const clientVersion = window.ytcfg?.get?.("INNERTUBE_CLIENT_VERSION") || 
                        window.ytcfg?.data_?.INNERTUBE_CLIENT_VERSION || 
                        window.ytcfg?.data?.INNERTUBE_CLIENT_VERSION ||
                        window.yt?.config_?.INNERTUBE_CLIENT_VERSION ||
                        "2.20240501.01.00";

  const clientNameNum = window.ytcfg?.get?.("INNERTUBE_CONTEXT_CLIENT_NAME") || 
                        window.ytcfg?.data_?.INNERTUBE_CONTEXT_CLIENT_NAME ||
                        window.ytcfg?.data?.INNERTUBE_CONTEXT_CLIENT_NAME ||
                        "1"; // 1 is WEB

  // Re-build client context if missing or incomplete
  if (!context || !context.client) {
    context = {
      client: {
        clientName: "WEB",
        clientVersion: clientVersion,
        hl: window.ytcfg?.get?.("HL") || window.ytcfg?.data_?.HL || window.ytcfg?.data?.HL || "en",
        gl: window.ytcfg?.get?.("GL") || window.ytcfg?.data_?.GL || window.ytcfg?.data?.GL || "US",
        utcOffsetMinutes: -new Date().getTimezoneOffset()
      }
    };
  }

  const identityToken = window.ytcfg?.get?.("ID_TOKEN") || 
                        window.ytcfg?.data_?.ID_TOKEN || 
                        window.ytcfg?.data?.ID_TOKEN ||
                        window.yt?.config_?.ID_TOKEN;


  if (!apiKey) {
    throw new Error("Unable to retrieve YouTube API Key (INNERTUBE_API_KEY). Ensure you are logged in and reload the page.");
  }

  let endpoint = "";
  let requestBody = { context };

  switch (action) {
    case "LIST_PLAYLISTS":
      endpoint = "/youtubei/v1/browse";
      requestBody.browseId = "FEplaylist_aggregation";
      break;

    case "GET_PLAYLIST":
      endpoint = "/youtubei/v1/browse";
      requestBody.browseId = "VL" + payload.playlistId;
      break;

    case "CREATE_PLAYLIST":
      endpoint = "/youtubei/v1/playlist/create";
      requestBody.title = payload.title;
      requestBody.privacyStatus = "PRIVATE";
      break;

    case "ADD_VIDEO":
      endpoint = "/youtubei/v1/browse/edit_playlist";
      requestBody.playlistId = payload.playlistId;
      requestBody.actions = [
        {
          addedVideoId: payload.videoId,
          action: "ACTION_ADD_VIDEO"
        }
      ];
      break;

    case "REMOVE_VIDEO":
      endpoint = "/youtubei/v1/browse/edit_playlist";
      requestBody.playlistId = payload.playlistId;
      requestBody.actions = [
        {
          action: "ACTION_REMOVE_VIDEO",
          setVideoId: payload.setVideoId
        }
      ];
      break;

    case "SET_DESCRIPTION":
      endpoint = "/youtubei/v1/browse/edit_playlist";
      requestBody.playlistId = payload.playlistId;
      requestBody.actions = [
        {
          action: "ACTION_SET_PLAYLIST_DESCRIPTION",
          playlistDescription: payload.description
        }
      ];
      break;

    default:
      throw new Error(`Unsupported API action: ${action}`);
  }

  const url = `https://www.youtube.com${endpoint}?key=${apiKey}`;
  const headers = {
    "Content-Type": "application/json",
  };

  // Generate and append SAPISIDHASH Authorization token
  const sapisid = getCookie("SAPISID") || 
                  getCookie("__Secure-3PAPISID") || 
                  getCookie("__Secure-1PAPISID");
  if (sapisid) {
    const sapisidHash = await getSapisidHash(sapisid, window.location.origin);
    headers["Authorization"] = `SAPISIDHASH ${sapisidHash}`;
  }

  if (identityToken) {
    headers["X-Youtube-Identity-Token"] = identityToken;
  }
  if (clientVersion) {
    headers["X-Youtube-Client-Version"] = clientVersion;
  }
  if (clientNameNum) {
    headers["X-Youtube-Client-Name"] = String(clientNameNum);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(requestBody),
    credentials: "include"
  });

  if (!response.ok) {
    let errMsg = `HTTP error! status: ${response.status} ${response.statusText}`;
    try {
      const errText = await response.text();
      try {
        const errData = JSON.parse(errText);
        if (errData && errData.error) {
          errMsg += ` - ${errData.error.message || JSON.stringify(errData.error)}`;
        }
      } catch (_) {
        if (errText) errMsg += ` - ${errText.substring(0, 250)}`;
      }
    } catch (_) {}
    throw new Error(errMsg);
  }

  const data = await response.json();
  
  // Check for YouTube-level errors
  if (data.error) {
    throw new Error(data.error.message || "YouTube API error");
  }

  return data;
}

// Helpers for cookie reading and SAPISIDHASH generation
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

async function sha1(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getSapisidHash(sapisid, origin) {
  const time = Math.floor(Date.now() / 1000);
  const hashInput = `${time} ${sapisid} ${origin}`;
  const sha1Hash = await sha1(hashInput);
  return `${time}_${sha1Hash}`;
}
