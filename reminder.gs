// =====================================================================
// Google Workspace Meeting Reminder Automation
// =====================================================================

// --- CONFIGURATION ---
// Set this to true to receive a Google Chat notification
var ENABLE_GOOGLE_CHAT = true; 
// Replace with your Google Chat Space Webhook URL.
// (In Google Chat, go to Space Settings -> Apps & integrations -> Webhooks -> Add Webhook)
var GOOGLE_CHAT_WEBHOOK_URL = "https://chat.googleapis.com/v1/spaces/AAQARpTxx-I/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=rWzNs-tyKTvq5qJTC5gqDM6rFGi0MNBKAQHonBGRQMs";
// ---------------------

/**
 * Main Scheduler function.
 * This runs once per day in the morning (e.g. 9:00 AM) and sets up 
 * exact pinpoint triggers for 10 minutes before each meeting today.
 */
function scheduleDailyReminders() {
  Logger.log("Running Daily Scheduler");

  // 1. Clear any leftover one-off triggers from yesterday just in case.
  clearPreviousMeetingTriggers();

  // 2. Define today's time window (now to end of day)
  var now = new Date();
  var endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  // 3. Fetch events for today
  var calendar = CalendarApp.getDefaultCalendar();
  var events = calendar.getEvents(now, endOfDay);
  Logger.log("Found " + events.length + " events between now and end of day.");

  // 4. Schedule a trigger exactly 10 minutes prior to each event
  for (var i = 0; i < events.length; i++) {
    var event = events[i];
    
    // Skip all-day events as they don't have a specific start time
    if (event.isAllDayEvent()) {
      Logger.log("Skipping all-day event: " + event.getTitle());
      continue;
    }
    
    var startTime = event.getStartTime();
    var triggerTime = new Date(startTime.getTime() - (10 * 60 * 1000)); // Subtract 10 mins

    // Only schedule if the trigger time is in the future
    if (triggerTime > now) {
      ScriptApp.newTrigger('processUpcomingMeeting')
               .timeBased()
               .at(triggerTime)
               .create();
      Logger.log("Scheduled a trigger at " + triggerTime.toLocaleString() + " for event: " + event.getTitle());
    } else {
      Logger.log("Event " + event.getTitle() + " has already started or is within 10 minutes. Skipping trigger.");
    }
  }
}

/**
 * Worker function triggered 10 minutes before a meeting.
 */
function processUpcomingMeeting() {
  Logger.log("Worker triggered to process upcoming meeting...");
  
  var now = new Date();
  
  // We look for any events starting approximately 9 to 11 minutes from NOW
  // This helps catch the specific event we scheduled the trigger for.
  var windowStart = new Date(now.getTime() + (9 * 60 * 1000));
  var windowEnd = new Date(now.getTime() + (11 * 60 * 1000));
  
  var calendar = CalendarApp.getDefaultCalendar();
  var upcomingEvents = calendar.getEvents(windowStart, windowEnd);
  
  for (var i = 0; i < upcomingEvents.length; i++) {
    var event = upcomingEvents[i];
    if (event.isAllDayEvent()) continue;
    
    Logger.log("Firing reminder for: " + event.getTitle());
    sendMeetingReminder(event);
  }
}

/**
 * Clears old triggers linked to 'processUpcomingMeeting'
 */
function clearPreviousMeetingTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processUpcomingMeeting') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

/**
 * Handles cross-referencing Drive files and sending the Email
 */
function sendMeetingReminder(event) {
  var title = event.getTitle();
  var desc = event.getDescription() || "No description provided.";
  var loc = event.getLocation() || "No location specified.";
  var start = event.getStartTime();
  
  // 1. Get Attendees
  var attendeeList = [];
  var guests = event.getGuestList();
  for (var i = 0; i < guests.length; i++) {
    attendeeList.push(guests[i].getEmail());
  }

  // 2. Query Google Drive for Related Files
  // Searches for files containing the exact title anywhere in the file content or title.
  var safeTitle = title.replace(/'/g, "\\'"); // escape single quotes for query
  var query = "fullText contains '" + safeTitle + "'";
  var relatedFiles = [];
  
  try {
    var filesIter = DriveApp.searchFiles(query);
    var limit = 0;
    while (filesIter.hasNext() && limit < 5) {
      var file = filesIter.next();
      relatedFiles.push({
        name: file.getName(),
        url: file.getUrl()
      });
      limit++;
    }
  } catch(e) {
    Logger.log("Error searching Drive: " + e.toString());
  }

  // 3. Construct Email Content
  var myEmail = Session.getActiveUser().getEmail();
  var subject = "Upcoming in 10 Mins: " + title;
  
  var htmlBody = "<div style='font-family: sans-serif; max-width: 600px;'>";
  htmlBody += "<h2 style='color: #4285F4;'>" + title + "</h2>";
  htmlBody += "<p><strong>Starts at:</strong> " + start.toLocaleString() + "</p>";
  htmlBody += "<p><strong>Location/Meeting Link:</strong> " + loc + "</p>";
  
  if (attendeeList.length > 0) {
    htmlBody += "<p><strong>Attendees:</strong> " + attendeeList.join(", ") + "</p>";
  }
  
  // Add files
  if (relatedFiles.length > 0) {
    htmlBody += "<div style='background-color: #F8F9FA; padding: 10px; border-radius: 5px;'>";
    htmlBody += "<h3 style='margin-top:0;'>Associated Drive Documents</h3>";
    htmlBody += "<ul style='margin-bottom:0;'>";
    for(var j = 0; j < relatedFiles.length; j++){
      htmlBody += "<li><a href='" + relatedFiles[j].url + "'>" + relatedFiles[j].name + "</a></li>";
    }
    htmlBody += "</ul></div>";
  } else {
    htmlBody += "<p><em>No directly relevant files found in Google Drive for this meeting.</em></p>";
  }
  
  // Add desc
  if (desc) {
    htmlBody += "<h3>Meeting Description/Notes</h3>";
    htmlBody += "<div style='border-left: 4px solid #ddd; padding-left: 10px; color: #555;'>" + desc + "</div>";
  }
  
  htmlBody += "</div>";

  // 4. Dispatch Email
  MailApp.sendEmail({
    to: myEmail,
    subject: subject,
    htmlBody: htmlBody
  });
  
  Logger.log("Successfully sent email for " + title);

  // 5. Dispatch Google Chat Message (if enabled)
  if (ENABLE_GOOGLE_CHAT && GOOGLE_CHAT_WEBHOOK_URL.indexOf("YOUR_WEBHOOK_URL") === -1) {
    var chatText = "🔔 *Meeting in 10 mins:* " + title + "\n📍 *Location/Link:* " + loc + "\n_Check your email for related Drive documents!_";
    var payload = { "text": chatText };
    var options = {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify(payload)
    };
    
    try {
      UrlFetchApp.fetch(GOOGLE_CHAT_WEBHOOK_URL, options);
      Logger.log("Successfully sent notification to Google Chat");
    } catch(e) {
      Logger.log("Error sending to Google Chat: " + e.toString());
    }
  }
}

/**
 * Utility Function: Run this manually ONCE to authorize permissions
 * and see what the email roughly looks like.
 */
function testReminder() {
  var myEmail = Session.getActiveUser().getEmail();
  MailApp.sendEmail({
    to: myEmail,
    subject: "Automator Authorization Successful!",
    htmlBody: "<h2>The script has exact permissions required!</h2><p>Your meeting reminders are ready to execute.</p>"
  });
  
  if (ENABLE_GOOGLE_CHAT && GOOGLE_CHAT_WEBHOOK_URL.indexOf("YOUR_WEBHOOK_URL") === -1) {
    var payload = { "text": "✅ *Test Successful!* Your Google Space is connected properly!" };
    try {
      UrlFetchApp.fetch(GOOGLE_CHAT_WEBHOOK_URL, {
        "method": "post",
        "contentType": "application/json",
        "payload": JSON.stringify(payload)
      });
    } catch(e) {}
  }
  
  // Doing a dummy search just to force Drive permissions prompt on first run
  DriveApp.searchFiles("title contains 'dummy'");
  CalendarApp.getDefaultCalendar().getEvents(new Date(), new Date());
}
