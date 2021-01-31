//
// Description: scheduleQuestStart function automatically force-start a quest after
// a given time from the first time it was found launched and inactive.
// Usage: Set HOURS_TO_WAIT variable if you need to update the time to
// wait between sending the invites and starting the quest.
//
// Two "Script Properties" need to be set before running.  Both the Habitica UserID and Token
// are now expected to be stored in the script properties: USER_ID and TOKEN respectively.
// In the classic Google Script editor select File -> Project Properties -> Script Properties.
// Once the "Project Properties" dialog box is open and on the "Script Properties" tab create
// an entry each for USER_ID and TOKEN setting the value appropriately for your Habitica account.
//
// A scheduler should be set to run scheduleQuestStart every X minutes (10-15 min ideal)
// 
// PMs are handled by reading a Opt-In tab on the "HK Tracking" spreadsheet. If your Guild uses
// a different spread sheet for tracking the guild activities then change the TRACKING variable to 
// the appropriate name.
//
// Credits: Original Quest Scheduler and auto PM scripts by Lucubro and SirLouen
// 2019.12.07: Script provided by Louen to AyrenneA
// 2019.12.10: Updated to use UserIDs instead of DisplayNames for the Exceptions List
// 2020.08.15: (Raifton) Added rate limits to conform to Habitica's max 30 requests per minute.
// 2020.12.24: (Raifton) Improved the rate limiting logic to handle the response headers.
// 2021.01.30: (Raifton) Added logic to read from an opt-in list on a google sheet of party members to send messages.
// 2021.01.30: (Raifton) Moved sensitve habitica token and user id up into script properties to permit posting to GitHub.
//

const AUTHOR_ID = "ebded617-5b88-4f67-9775-6c89ac45014f"; // Rafton on Habitica's user id fpr the x-client header parameter.
const GUEST_LOG = "Habitica-scheduleQuestStart.log";
const TRACKING = "HK Tracking";
const OPT_IN = "Opt-In";
const HOURS_TO_WAIT = 4; // Wait 4 hours before forcing quest start.

const COLUMN = { USER: 0, NAME: 1, ID: 2, OPTIN: 3 };

function scheduleQuestStart() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const habId = scriptProperties.getProperty("USER_ID"); // Your Habitica API user ID - (party leader)
  const habToken = scriptProperties.getProperty("TOKEN"); // Your Habitica API key token

  let party = fetchPartyData(habId, habToken);
  //  updateParty(party);
  //  return;

  // If there is a quest already active, there's nothing to do.
  // Last mod 15/10/2018: if it's inactive we might be sending a PM (see below)
  if (party.quest.active) {
    console.info("Quest already active....: " + party.quest.key);
    return;
  }

  // parse file for quest id and start time that was recorded.
  let file = loadFile(GUEST_LOG, true);
  let previousQuestLog = readDataLog(file);

  // If this is the first time there's no quest going on, send a PM to everybody.
  if (party.quest.key === undefined || party.quest.key === null || party.quest.key === "") {
    console.info("No quest is currently active.");
    if (previousQuestLog.key !== "undefined" && previousQuestLog.key !== null) {
      party = updateParty(party);
      messageParty(party, habId, habToken);

      // Update file so that we won't send the PM on the next trigger.
      file.setContent(party.questLog);
    }
    return;
  }

  // If this is a NEW inactive quest, then store the data in the file.
  if (party.quest.key != previousQuestLog.key) {
    console.info("Found new inactive quest. Storing information...: " + party.quest.key)
    file.setContent(party.questLog);
    return;
  }

  forceQuestStart(party.quest, previousQuestLog, HOURS_TO_WAIT, habId, habToken);
  console.info("completed scheduleQuestStart...");
}

/**
 * Read the Opt-in tab for a list of members that may want
 * notifications.  Merge this date with the active party members.
 * The merged list is re written out to the Opt-In tab.
 * If member leave and join this keeps the list on the Opt-In 
 * tab updated.
 * 
 * returns a copy of the given party with a member list update with opt-in
 */
function updateParty(party) {
  let file = loadFile(TRACKING);
  let tracker = SpreadsheetApp.open(file);

  let optInSheet = tracker.getSheetByName(OPT_IN);
  if (optInSheet === null || optInSheet === undefined) {
    optInSheet = tracker.insertSheet(OPT_IN);
  }

  let memberOptIn = readOptIn(optInSheet);
  let members = mergeMembers(memberOptIn, party.members);
  updateOptIn(optInSheet, members);

  party.members = members;
  return party;
}


function mergeMembers(membersOptIn, partyMembers) {
  let members = partyMembers;

  membersOptIn.forEach(processPartyMember);

  // Ensure the send meddage field it correctly assigned from the Opt-in page.
  // Sending PMs is disabled by default and a use must opt-in by the opt-in page.
  function processPartyMember(m) {
    let found = false;
    for (let t = 0; t < members.length && !found; t++) {
      if (m.id === members[t].id) {
        members[t].message = m.message;
        found = true;
      }
    }
  }

  return members;
}


/**
 * Parse the member data on the Opt-In page
 * and palce it into an internal structure
 * for further processing.
 */
function readOptIn(sheet) {
  let members = [];
  let rows = sheet.getDataRange().getValues();
  if (rows.length > 1) {
    for (let i = 1; i < rows.length; i++) {
      collectMember(rows[i]);
    }
  }

  function collectMember(row) {
    var data = {
      "id": row[COLUMN.ID],
      "username": row[COLUMN.USER],
      "name": row[COLUMN.NAME],
      "processed": false,
      "message": (row[COLUMN.OPTIN] === 'Y' || row[COLUMN.OPTIN] === 'y' ? true : false)
    };
    members.push(data);
  }
  return members;
}


/**
 *  Update the opt-in page this the current list
 * of guild members.
 */
function updateOptIn(sheet, members) {
  //clearSheet(sheet);

  let range = sheet.getRange(1, 1, members.length + 1, 4);
  let values = range.getValues();
  let row = values[0];

  row[COLUMN.USER] = "User";
  row[COLUMN.NAME] = "Name";
  row[COLUMN.ID] = "User ID";
  row[COLUMN.OPTIN] = "Opt-In";

  for (var i = 0; i < members.length; i++) {
    row = values[i + 1];
    row[COLUMN.USER] = members[i].username;
    row[COLUMN.NAME] = members[i].name;
    row[COLUMN.ID] = members[i].id;
    row[COLUMN.OPTIN] = (members[i].message ? "Y" : "");
  }

  range.setValues(values);
  sheet.autoResizeColumns(1, 4);

  let SORT_RANGE = "A2:D"+members.length;
  let SORT_ORDER = [
    { column: 1, ascending: true },
    { column: 2, ascending: true },
    { column: 3, ascending: true },
    { column: 4, ascending: true }
  ];

  let sortRange = sheet.getRange(SORT_RANGE);
  sortRange.sort(SORT_ORDER);

  sheet.hideColumns(COLUMN.NAME + 1);
  sheet.hideColumns(COLUMN.ID + 1);
}


/** 
 * This clears the active data range on a spreadsheet
 */
// function clearSheet(sheet) {
//   let data = sheet.getDataRange();
//   let rows = data.getValues();
//   rows.forEach(clearValue);
//   function clearValue(r) {
//     r[COLUMN.USER] = "";
//     r[COLUMN.NAME] = "";
//     r[COLUMN.ID] = "";
//     r[COLUMN.OPTIN] = "";
//   }
//   data.setValues(rows);
// }


/**
  Parse the quest data from the log file given and return the data in a structure.
*/
function readDataLog(file) {
  let data = { "date": new Date(), "key": "" };
  let driveFileContent = file.getAs("text/plain").getDataAsString().split("\n");
  if (driveFileContent !== undefined && driveFileContent.length >= 2) {
    data.date = new Date(driveFileContent[0]);
    data.key = driveFileContent[1];
  }
  return data;
}


/**
 * Loads a file form google drive.  If the 'createMissingFile'
 * is set to true and the file is not found it will be created.
 */
function loadFile(name, createMissingFile) {
  var files = DriveApp.getFilesByName(name);
  if (!files.hasNext()) {
    if (createMissingFile === true) {
      return createFile(name, "");
    }
    console.error("Unable to find Google Drive file: " + name);
    return;
  }
  return files.next();
}


/**
 * Creates the given file on google drive.
 */
function createFile(name, content) {
  console.log("Creating Google Drive file...: " + name);
  var file = DriveApp.createFile(name, content);
  return file;
}


/**
 * Fetches party data and the member list from habitica
 * and provides an opject for the questLog data 
 * processing and comparison.  
 */
function fetchPartyData(habId, habToken) {
  var params = {
    "method": "get",
    "headers": {
      "x-api-user": habId,
      "x-api-key": habToken,
      "x-client": AUTHOR_ID + "-scheduleQuestStart"
    }
  };

  let packet = fetchQuest(params);
  let quest = packet.quest;
  let questLog = packet.questLog;

  packet = fetchAllPartyMembers(params);
  var members = packet.members;

  return { "header": packet.header, "quest": quest, "questLog": questLog, "members": members };
}


/**
 * Get the information about the active quest for the current party.
 */
function fetchQuest(getParams) {
  // Retrieve info about the current party quest.
  var urlRequest = "https://habitica.com/api/v3/groups/party";
  var response = UrlFetchApp.fetch(urlRequest, getParams);
  var party = JSON.parse(response);
  var header = buildHeader(response);

  var now = new Date();
  var questLog = now + "\n" + party.data.quest.key;

  return { "header": header, "quest": party.data.quest, "questLog": questLog };
}


/**
 * Grabs the current list of party members.  This is the
 * authoritative list regardless of the members listed on the Opt-In
 * page.  The opt-in page is used for user to sign up for messages if desired.
 * Users that have left will be replaced when the page refreshes with the 
 * authoritative list here.
 */
function fetchAllPartyMembers(getParams) {
  // Retrieve info about the current party members.
  var urlRequest = "https://habitica.com/api/v3/groups/party/members";
  var response = UrlFetchApp.fetch(urlRequest, getParams);
  var party = JSON.parse(response);

  var members = [];
  party.data.forEach(collectMember);

  function collectMember(m) {
    var data = { "id": m.id, "username": m.auth.local.username, "name": m.profile.name, "processed": false, "message": false };
    members.push(data);
  }

  var header = buildHeader(response);
  return { "header": header, "members": members };
}


/**
 * Message party members that have selected to be messaged when
 * the quest ends.
 */
function messageParty(party, habId, habToken) {
  let header = party.header;
  let members = party.members;

  const message = "The quest is over. You can launch a new quest now." +
    "If you don't want to recieve this message any more please " +
    "clear your opt-in cell on the Opt-In tab of the party spreadsheet.";

  var getParamsTemplate = {
    "method": "get",
    "headers": {
      "x-api-user": habId,
      "x-api-key": habToken,
      "x-client": AUTHOR_ID + "-scheduleQuestStart"
    }
  }

  let postParamsTemplate = {
    "method": "post",
    "headers": {
      "x-api-user": habId,
      "x-api-key": habToken,
      "x-client": AUTHOR_ID + "-scheduleQuestStart"
    }
  }

  // Prepare POST parameters.
  postParamsTemplate["payload"] = {
    "message": message,
    "toUserId": undefined
  };


  for (var i = 0; i < members.length; i++) {
    if (members[i].message === true) {
      let memberID = members[i].id;
      let response;

      // Send PM.
      let objectionURL = "https://habitica.com/api/v3/members/" + memberID + "/objections/send-private-message";
      response = JSON.parse(UrlFetchApp.fetch(objectionURL, getParamsTemplate));
      let arrayObjection = response["data"];

      postParamsTemplate["payload"]["toUserId"] = memberID;

      // If no objections then launch the message
      if (!(typeof arrayObjection !== 'undefined' && arrayObjection.length > 0)) {
        console.log("Sending PM to: " + members[i].username);

        response = UrlFetchApp.fetch("https://habitica.com/api/v3/members/send-private-message", postParamsTemplate);
        header = buildHeader(response);
        if (header.remaining <= 2) {
          console.warn("Reached rate limit.  Pausing until: " + header.reset);
          let now = new Date();
          let delay = header.reset.getMilliseconds() - now.getMilliseconds();
          Utilities.sleep(delay);
        }
      }
    }

  }
}

/**
 * Force the quest to begin uses the timestamp in the quest log
 * the determine if the quest needs to be forced.
 */
function forceQuestStart(quest, previousQuestLog, waitingTime, habId, habToken) {
  let header = {};
  let postParamsTemplate = {
    "method": "post",
    "headers": {
      "x-api-user": habId,
      "x-api-key": habToken,
      "x-client": AUTHOR_ID + "-scheduleQuestStart"
    }
  };

  // If this is an OLD inactive quest, then check if we need to force-start it.
  const now = new Date();
  let startTime = previousQuestLog.date;
  startTime.setHours(startTime.getHours() + waitingTime);
  if (now >= startTime) {
    console.warn("Force-starting the quest...:" + previousQuestLog.key);
    //urlRequest = "https://habitica.com/api/v3/groups/party/quests/force-start";
    //let response = UrlFetchApp.fetch(urlRequest, postParamsTemplate);
    //header = buildHeader(response);
  } else {
    console.log("Waiting for starting time for quest " + quest.key + "... " + startTime);
  }
  return header;
}


/**
 * Fetches the ratelimit data from the response and puts
 * it into an opbject for further processing.  The
 * rate limit data tells us if we need to stop processing and
 * wait a short bit before sending again.
 */
function buildHeader(response) {
  var head = response.getHeaders();
  return {
    "limit": head['x-ratelimit-limit'],
    "remaining": head['x-ratelimit-remaining'],
    "reset": head['x-ratelimit-reset']
  };
}