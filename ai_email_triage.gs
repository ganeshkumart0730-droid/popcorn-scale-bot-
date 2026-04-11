// =====================================================================
// AI-Powered Email Triage & Reminder System (Powered by Gemini 1.5)
// =====================================================================

// --- CONFIGURATION ---
var GOOGLE_CHAT_WEBHOOK_URL = "https://chat.googleapis.com/v1/spaces/AAQARpTxx-I/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=rWzNs-tyKTvq5qJTC5gqDM6rFGi0MNBKAQHonBGRQMs"; 
var GEMINI_API_KEY = "AIzaSyCW3S1L4keWa2IGyVacSYAOmUVJnvFqSkw";
// Leave this blank on first run. After running setupDatabase(), replace this with the generated ID.
var SPREADSHEET_ID = "1XIvzg-G9OMPrZdhal-oVHCWq6HftyUsiSpfVu9Ov7Lk"; 
// ---------------------

/**
 * 1. POLLER FUNCTION
 * Run this on a Time-Driven Trigger every 5 or 10 minutes.
 */
function pollInbox() {
  Logger.log("Polling inbox for new emails...");
  
  // Ensure our tracking label exists
  var labelName = "🤖 AI Triaged";
  var label = GmailApp.getUserLabelByName(labelName);
  if (!label) {
    label = GmailApp.createLabel(labelName);
  }

  // Search for Unread emails in Inbox that haven't been triaged yet.
  // Exclude promotions and social organically.
  var query = "is:unread in:inbox -label:\"" + labelName + "\" -category:promotions -category:social";
  var threads = GmailApp.search(query, 0, 10); // Process max 10 threads per run to avoid timeout
  
  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages();
    
    for (var j = 0; j < messages.length; j++) {
      var msg = messages[j];
      
      // Skip if somehow we already processed it (failsafe)
      var msgLabels = threads[i].getLabels();
      var alreadyProcessed = false;
      for (var k=0; k<msgLabels.length; k++) {
        if (msgLabels[k].getName() === labelName) alreadyProcessed = true;
      }
      if (alreadyProcessed) continue;

      var subject = msg.getSubject();
      var sender = msg.getFrom();
      var body = msg.getPlainBody();
      var msgId = msg.getId();
      var link = "https://mail.google.com/mail/u/0/#inbox/" + msgId;
      
      Logger.log("Analyzing Email: " + subject);
      
      try {
        var aiAnalysis = analyzeWithGemini(subject, sender, body);
        
        if (aiAnalysis && aiAnalysis.is_important) {
          Logger.log("Email flagged as IMPORTANT. Dispatching notification...");
          sendChatNotification(sender, subject, aiAnalysis, link);
          
          if (aiAnalysis.deadline && SPREADSHEET_ID !== "") {
            logDeadline(aiAnalysis, link, sender, subject);
          }
        } else {
          Logger.log("Email classified as junk/unimportant.");
        }
      } catch (e) {
        Logger.log("Error analyzing email: " + e.message);
      }
    }
    // Tag the thread so we never process it again
    threads[i].addLabel(label);
  }
}

/**
 * 2. AI ANALYZER
 * Calls the Gemini API to parse meaning and intent out of unstructured text.
 */
function analyzeWithGemini(subject, sender, body) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_API_KEY;
  
  // Truncate body to save tokens and prevent huge email bodies from failing
  if (body.length > 5000) {
    body = body.substring(0, 5000);
  }

  var prompt = "You are an executive assistant summarizing my inbox. Analyze the following email.\n\n" +
               "SENDER: " + sender + "\n" +
               "SUBJECT: " + subject + "\n" +
               "BODY: " + body + "\n\n" +
               "Is this email important? Important emails include: meeting reminders, bills, OTPs, deadline notifications, bank/payment alerts, job/interview emails, and urgent requests. Ignore spam, promotions, cold outreach, and newsletters.\n" +
               "Respond strictly entirely as a JSON object, with no markdown code blocks or extra text. Output schema:\n" +
               "{\n" +
               "  \"is_important\": boolean,\n" +
               "  \"category\": string (A short 1-2 word label, e.g., 'Bank Alert', 'OTP', 'Meeting', 'Bill', 'Job'),\n" +
               "  \"summary\": string (A very clear passing summary. Maximum 2 short sentences),\n" +
               "  \"action_required\": string (What I need to do right now. If nothing, output null),\n" +
               "  \"deadline\": string (If a specific due date/time is mentioned, format it exactly as 'YYYY-MM-DDTHH:MM:SSZ'. If no deadline exists, output null),\n" +
               "  \"is_urgent\": boolean (true if action is required within 48 hours, or if it is an OTP or urgent alert)\n" +
               "}";

  var payload = {
    "contents": [{
      "parts": [{"text": prompt}]
    }],
    "generationConfig": {
        "temperature": 0.1,
        "responseMimeType": "application/json"
    }
  };

  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  var response = UrlFetchApp.fetch(url, options);
  var jsonResponse = JSON.parse(response.getContentText());
  
  if (jsonResponse.error) {
     throw new Error("Gemini API Error: " + jsonResponse.error.message);
  }

  var responseText = jsonResponse.candidates[0].content.parts[0].text;
  return JSON.parse(responseText);
}

/**
 * 3. NOTIFICATION DISPATCHER
 * Formats the AI's data into a clean Webhook message
 */
function sendChatNotification(sender, subject, aiData, link) {
  var urgencyIcon = aiData.is_urgent ? "🚨 *URGENT* 🚨\n" : "🔔 ";
  var deadlineText = aiData.deadline ? "\n⏰ *Deadline:* " + new Date(aiData.deadline).toLocaleString() : "";
  var actionText = aiData.action_required ? "\n👉 *Action Required:* " + aiData.action_required : "";
  
  var chatText = urgencyIcon + "*" + aiData.category + " Alert*\n" +
                 "👤 *From:* " + sender + "\n" +
                 "📄 *Subject:* " + subject + "\n" +
                 "📝 *Summary:* " + aiData.summary +
                 actionText + deadlineText + "\n\n" +
                 "🔗 <" + link + "|Open Email>";
                 
  var payload = { "text": chatText };
  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload)
  };
  
  UrlFetchApp.fetch(GOOGLE_CHAT_WEBHOOK_URL, options);
}

/**
 * 4. DEADLINE TRACKER (DATABASE WRITE)
 */
function logDeadline(aiData, link, sender, subject) {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
  var deadlineDate = new Date(aiData.deadline);
  
  // If the AI gave us a garbage date, skip
  if (isNaN(deadlineDate.getTime())) return;

  sheet.appendRow([
    new Date(),               // Timestamp Logged
    deadlineDate,             // Actual Deadline
    "PENDING",                // Status
    aiData.summary,           // Task Summary
    aiData.action_required,   // Action
    subject,                  // Subject
    link                      // URL
  ]);
}

/**
 * 5. FOLLOW UP CRON JOB
 * Run this on a Time-Driven Trigger every 1 hour.
 */
function checkUpcomingDeadlines() {
  if (SPREADSHEET_ID === "") return;
  
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return; // Only headers exist
  
  var now = new Date().getTime();
  var oneDayMs = 24 * 60 * 60 * 1000;
  var oneHourMs = 1 * 60 * 60 * 1000;
  
  for (var i = 1; i < data.length; i++) {
    var status = data[i][2];
    var deadlineStr = data[i][1];
    var deadline = new Date(deadlineStr).getTime();
    
    if (isNaN(deadline) || status === "COMPLETED") continue;
    
    var timeRemaining = deadline - now;
    
    // Check if it's less than 1 hour away and hasn't been sent yet
    if (timeRemaining > 0 && timeRemaining <= oneHourMs && status !== "1_HOUR_SENT") {
       sendReminderAlert(data[i], "1 HOUR");
       sheet.getRange(i+1, 3).setValue("1_HOUR_SENT"); // Update status
    }
    // Check if it's less than 24 hours away and hasn't been sent yet
    else if (timeRemaining > 0 && timeRemaining <= oneDayMs && status === "PENDING") {
       sendReminderAlert(data[i], "24 HOURS");
       sheet.getRange(i+1, 3).setValue("1_DAY_SENT"); // Update status
    }
    // If deadline passed, mark complete
    else if (timeRemaining <= 0) {
       sheet.getRange(i+1, 3).setValue("COMPLETED");
    }
  }
}

function sendReminderAlert(row, timeframe) {
  var summary = row[3];
  var action = row[4];
  var link = row[6];
  
  var text = "⏱️ *DEADLINE APPROACHING IN " + timeframe + "*\n" +
             "📝 *" + summary + "*\n";
  if (action && action !== "null") text += "👉 *Action Needed:* " + action + "\n";
  text += "🔗 <" + link + "|Open Email>";
             
  var payload = { "text": text };
  UrlFetchApp.fetch(GOOGLE_CHAT_WEBHOOK_URL, {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload)
  });
}

/**
 * 6. UTILITY: SETUP DATABASE
 * Run this ONCE to construct the spreadsheet.
 */
function setupDatabase() {
  var ss = SpreadsheetApp.create("AI Executive Assistant - Task Deadlines");
  var sheet = ss.getActiveSheet();
  
  // Create Headers
  sheet.appendRow(["Logged Date", "Deadline Date", "Status", "Summary", "Action Needed", "Email Subject", "Email Link"]);
  sheet.getRange("A1:G1").setFontWeight("bold").setBackground("#d9ead3");
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(4, 300);
  
  Logger.log("DATABASE CREATED SUCCESSFULLY!");
  Logger.log("Please copy this ID and put it inside SPREADSHEET_ID in your code:");
  Logger.log(ss.getId());
}
