"use strict";

const PLUGIN_NAME = "olt-xapi";

async function register({ registerHook, registerSetting, settingsManager, peertubeHelpers }) {
  const logger = peertubeHelpers.logger;

  registerSetting({
    name: "enabled",
    label: "Enable OLT xAPI demo statements",
    type: "input-checkbox",
    default: true,
    private: false
  });

  registerSetting({
    name: "internal-ingest-url",
    label: "Internal ingest URL",
    type: "input",
    default: "",
    private: true
  });

  registerSetting({
    name: "public-ingest-url",
    label: "Public ingest URL",
    type: "input",
    default: "",
    private: false
  });

  registerSetting({
    name: "activity-prefix",
    label: "Activity prefix",
    type: "input",
    default: "http://peertube.localhost/xapi",
    private: false
  });

  registerHook({
    target: "action:api.video.uploaded",
    handler: params => emitVideoStatement("created", params, settingsManager, peertubeHelpers, logger)
  });

  registerHook({
    target: "action:api.video.viewed",
    handler: params => emitVideoStatement("experienced", params, settingsManager, peertubeHelpers, logger)
  });
}

async function unregister() {}

async function emitVideoStatement(verbKey, params, settingsManager, peertubeHelpers, logger) {
  const settings = await settingsManager.getSettings(["enabled", "internal-ingest-url", "activity-prefix"]);
  const enabled = settings.enabled !== false && settings.enabled !== "false";
  const ingestUrl = String(settings["internal-ingest-url"] || "").trim();

  if (!enabled || !ingestUrl) {
    return;
  }

  const video = params && (params.video || params.videoObject || params.videoModel);
  const req = params && params.req;
  const statement = buildStatement({
    verbKey,
    video,
    actor: actorFromRequest(req),
    activityPrefix: settings["activity-prefix"],
    webserverUrl: peertubeHelpers.config.getWebserverUrl(),
    source: "peertube-server-hook"
  });

  try {
    const response = await fetch(ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Experience-API-Version": "1.0.3"
      },
      body: JSON.stringify(statement)
    });

    if (!response.ok) {
      logger.warn(`[${PLUGIN_NAME}] xAPI ingest returned ${response.status} for ${verbKey}`);
    }
  } catch (error) {
    logger.warn(`[${PLUGIN_NAME}] could not emit ${verbKey} xAPI statement: ${error.message}`);
  }
}

function buildStatement({ verbKey, video, actor, activityPrefix, webserverUrl, source }) {
  const verb = verbFor(verbKey);
  const videoId = video && (video.uuid || video.id || video.url || "unknown-video");
  const name = video && (video.name || video.title || video.uuid);
  const activityId = `${trimTrailingSlash(activityPrefix || webserverUrl)}/videos/${encodeURIComponent(videoId)}`;

  return {
    actor,
    verb,
    object: {
      id: activityId,
      definition: {
        type: "https://w3id.org/xapi/video/activity-type/video",
        name: {
          "en-US": name || "PeerTube video"
        }
      }
    },
    context: {
      platform: "PeerTube",
      extensions: {
        "https://openlearningtools.local/xapi/extensions/source": source,
        "https://openlearningtools.local/xapi/extensions/video-url": video && video.url
          ? video.url
          : `${trimTrailingSlash(webserverUrl)}/w/${videoId}`
      }
    },
    timestamp: new Date().toISOString()
  };
}

function actorFromRequest(req) {
  const user = req && req.user;
  const account = user && user.Account;
  const name = account && (account.name || account.preferredUsername) || user && (user.username || user.email);

  return {
    account: {
      homePage: "http://peertube.localhost",
      name: name || "local-peertube-user"
    }
  };
}

function verbFor(key) {
  const verbs = {
    created: {
      id: "http://activitystrea.ms/schema/1.0/create",
      display: { "en-US": "created" }
    },
    experienced: {
      id: "http://adlnet.gov/expapi/verbs/experienced",
      display: { "en-US": "experienced" }
    }
  };

  return verbs[key] || verbs.experienced;
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

module.exports = {
  register,
  unregister
};
