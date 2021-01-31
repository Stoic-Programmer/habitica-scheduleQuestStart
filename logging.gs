/**
 * Copyright (c) 2021 by Nicholas R. Ustick
 * 
 * Logging functions to help debug the script when needed.
*/

function logFileDetail(file) {
  if (file === undefined || file === null) {
    console.log("file not found...");
    return;
  }
  console.log("File is:  " + file.getName());
  console.log("    URL:  " + file.getUrl());
  console.log("     ID:  " + file.getId());
}


function logSpreadSheet(spreadSheet) {
  if (spreadSheet === undefined || spreadSheet == null) {
    console.log("spread sheet not found...");
    return;
  }
  console.log("spreadsheet: " + spreadSheet.getName());
  console.log("URL........: " + spreadSheet.getUrl());
  console.log("ID.........: " + spreadSheet.getId());
  console.log("Sheets.....: " + spreadSheet.getNumSheets());
}

function logSheet(sheet) {
  if (sheet === undefined || sheet == null) {
    console.log("sheet not found...");
    return;
  }

  console.log("Sheet: " + sheet.getName());
  console.log("   ID: " + sheet.getSheetId());
}


