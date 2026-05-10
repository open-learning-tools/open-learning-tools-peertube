"use strict";

let currentVideo = null;
let currentSettings = null;
let attachedVideoElement = null;
let lastProgressBucket = 0;

function register({ registerHook, peertubeHelpers }) {
  registerHook({
    target: "action:video-watch.video.loaded",
    handler: ({ video }) => {
      currentVideo = video;
      lastProgressBucket = 0;
      refreshSettings(peertubeHelpers).then(() => emit("experienced", peertubeHelpers));
    }
  });

  registerHook({
    target: "action:video-watch.player.loaded",
    handler: () => {
      refreshSettings(peertubeHelpers).then(() => attachPlayerListeners(peertubeHelpers));
    }
  });
}

function refreshSettings(peertubeHelpers) {
  return peertubeHelpers.getSettings()
    .then(settings => {
      currentSettings = settings || {};
    })
    .catch(() => {
      currentSettings = {};
    });
}

function attachPlayerListeners(peertubeHelpers) {
  const videoElement = document.querySelector("video");

  if (!videoElement || videoElement === attachedVideoElement) {
    return;
  }

  attachedVideoElement = videoElement;
  videoElement.addEventListener("play", () => emit("played", peertubeHelpers));
  videoElement.addEventListener("pause", () => {
    if (!videoElement.ended) {
      emit("paused", peertubeHelpers);
    }
  });
  videoElement.addEventListener("seeked", () => emit("seeked", peertubeHelpers));
  videoElement.addEventListener("ended", () => emit("completed", peertubeHelpers));
  videoElement.addEventListener("timeupdate", () => emitProgressMilestone(videoElement, peertubeHelpers));
}

function emitProgressMilestone(videoElement, peertubeHelpers) {
  if (!Number.isFinite(videoElement.duration) || videoElement.duration <= 0) {
    return;
  }

  const percent = Math.floor((videoElement.currentTime / videoElement.duration) * 100);
  const bucket = [25, 50, 75].find(value => percent >= value && lastProgressBucket < value);

  if (!bucket) {
    return;
  }

  lastProgressBucket = bucket;
  emit("progressed", peertubeHelpers, { progress: bucket });
}

function emit(verbKey, peertubeHelpers, extraExtensions) {
  if (!currentVideo) {
    return;
  }

  const settings = currentSettings || {};
  const enabled = settings.enabled !== false && settings.enabled !== "false";
  const ingestUrl = String(settings["public-ingest-url"] || "").trim();

  if (!enabled || !ingestUrl) {
    return;
  }

  const statement = buildStatement({
    verbKey,
    video: currentVideo,
    user: safeGetUser(peertubeHelpers),
    activityPrefix: settings["activity-prefix"],
    extraExtensions
  });

  window.fetch(ingestUrl, {
    method: "POST",
    mode: "cors",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      "X-Experience-API-Version": "1.0.3"
    },
    body: JSON.stringify(statement)
  }).catch(() => {});
}

function buildStatement({ verbKey, video, user, activityPrefix, extraExtensions }) {
  const videoId = video.uuid || video.id || "unknown-video";
  const activityId = `${trimTrailingSlash(activityPrefix || window.location.origin)}/videos/${encodeURIComponent(videoId)}`;
  const canonicalUrl = video.url || `${window.location.origin}/w/${videoId}`;

  return {
    actor: actorFromUser(user),
    verb: verbFor(verbKey),
    object: {
      id: activityId,
      definition: {
        type: "https://w3id.org/xapi/video/activity-type/video",
        name: {
          "en-US": video.name || "PeerTube video"
        }
      }
    },
    context: {
      platform: "PeerTube",
      extensions: Object.assign({
        "https://openlearningtools.local/xapi/extensions/source": "peertube-video-watch-client",
        "https://openlearningtools.local/xapi/extensions/video-url": canonicalUrl
      }, extraExtensions || {})
    },
    timestamp: new Date().toISOString()
  };
}

function actorFromUser(user) {
  if (user && (user.username || user.account && user.account.name)) {
    return {
      account: {
        homePage: window.location.origin,
        name: user.username || user.account.name
      }
    };
  }

  return {
    account: {
      homePage: window.location.origin,
      name: getAnonymousActorId()
    }
  };
}

function getAnonymousActorId() {
  const key = "olt-xapi-anonymous-actor";
  let actorId = window.localStorage.getItem(key);

  if (!actorId) {
    actorId = `anonymous-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.localStorage.setItem(key, actorId);
  }

  return actorId;
}

function safeGetUser(peertubeHelpers) {
  try {
    return peertubeHelpers.getUser();
  } catch {
    return null;
  }
}

function verbFor(key) {
  const verbs = {
    experienced: {
      id: "http://adlnet.gov/expapi/verbs/experienced",
      display: { "en-US": "experienced" }
    },
    played: {
      id: "https://w3id.org/xapi/video/verbs/played",
      display: { "en-US": "played" }
    },
    paused: {
      id: "https://w3id.org/xapi/video/verbs/paused",
      display: { "en-US": "paused" }
    },
    seeked: {
      id: "https://w3id.org/xapi/video/verbs/seeked",
      display: { "en-US": "seeked" }
    },
    completed: {
      id: "http://adlnet.gov/expapi/verbs/completed",
      display: { "en-US": "completed" }
    },
    progressed: {
      id: "https://w3id.org/xapi/video/verbs/progressed",
      display: { "en-US": "progressed" }
    }
  };

  return verbs[key] || verbs.experienced;
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

export {
  register
};
