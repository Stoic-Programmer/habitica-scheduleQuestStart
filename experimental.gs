/**
 * Copyright (c) 2021 by Nicholas R. Ustick
 * 
 * Ideas I am toying with before I incorporate them into the main script.
*/

function logCurrentQuest() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const habId = scriptProperties.getProperty("USER_ID"); // Your Habitica API user ID - (party leader)
  const habToken = scriptProperties.getProperty("TOKEN"); // Your Habitica API key token

  let party = fetchPartyData(habId, habToken);
  let questList = [];

  // parse file for quest id and start time that was recorded.
  let file = loadJSONFile("test.json", "");
  let previousQuestLog = readJSONData(file);
  console.log(previousQuestLog);
  if ( previousQuestLog.length > 0 ) {
    for(let t = 0; t < previousQuestLog.length; t++) {
      questList.push(previousQuestLog[t]);
    }
  }
  party.quest.date = new Date();
  questList.push(party.quest);

  let partyLog = JSON.stringify(questList);
  file.setContent(partyLog);
  console.log(partyLog);
}


/**
 * Loads a file form google drive.  If the 'createMissingFile'
 * is set to true and the file is not found it will be created.
 */
function loadJSONFile(name, createMissingFile) {
  var files = DriveApp.getFilesByName(name);
  if (!files.hasNext()) {
    if (createMissingFile !== undefined) {
      return createFile(name, createMissingFile);
    }
    console.error("Unable to find Google Drive file: " + name);
    return;
  }
  return files.next();
}


/**
  Parse the quest data from the log file given and return the data in a structure.
*/
function readJSONData(file) {
  let jsonFile = file.getAs("application/json");
  let jsonString = jsonFile.getDataAsString();
  if (jsonString === undefined || jsonString === "") {
    return "";
  }
  let data = JSON.parse(jsonFile.getDataAsString());
  return data;
}
