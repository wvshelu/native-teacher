"use strict";
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const FACEBOOK_GRAPH_API_BASE_URL = "https://graph.facebook.com/v2.6/";

const request = require("request"),
  express = require("express"),
  body_parser = require("body-parser"),
  mongoose = require("mongoose"),
  app = express().use(body_parser.json()); // creates express http server

const MongoClient = require("mongodb").MongoClient;

// Sets server port and logs message on success
app.listen(process.env.PORT || 1337, () => console.log("webhook is listening"));

// Accepts POST requests at /webhook endpoint
app.post("/webhook", (req, res) => {
  // Parse the request body from the POST
  let body = req.body;
  // Check the webhook event is from a Page subscription
  if (body.object === "page") {
    // Iterate over each entry - there may be multiple if batched
    body.entry.forEach(function(entry) {
      // Gets the body of the webhook event
      let webhook_event = entry.messaging[0];
      console.log(webhook_event);

      // Get the sender PSID
      let sender_psid = webhook_event.sender.id;
      console.log("Sender PSID: " + sender_psid);

      // Check if the event is a message or postback and
      // pass the event to the appropriate handler function
      if (webhook_event.message) {
        if (containsUser()) handleMessage(sender_psid, webhook_event.message);
      } else if (webhook_event.postback) {
        handlePostback(sender_psid, webhook_event.postback);
      }
    });

    // Return a '200 OK' response to all events
    res.status(200).send("EVENT_RECEIVED");
  } else {
    // Return a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }
});

// Accepts GET requests at the /webhook endpoint
app.get("/webhook", (req, res) => {
  // UPDATE YOUR VERIFY TOKEN
  const VERIFY_TOKEN = process.env.VERIFICATION_TOKEN;
  console.log(VERIFY_TOKEN);
  // Parse the query params
  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];
  // Checks if a token and mode is in the query string of the request
  if (mode && token) {
    // Checks the mode and token sent is correct
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      // Responds with the challenge token from the request
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  }
});

function handleMessage(sender_psid, received_message) {
  let response;

  // Checks if the message contains text
  if (received_message.text) {
    // Create the payload for a basic text message, which
    // will be added to the body of our request to the Send API
    if (!containsUser(sender_psid)) greetUser(sender_psid);
    else if (!containsLanguage(sender_psid))
      return "What language would you like to learn?";
    else if (!containsLanguagePair(sender_psid))
      return "We will send you a message when we have your match!";
    else return;
  } else if (received_message.attachments) {
    // Get the URL of the message attachment
    let attachment_url = received_message.attachments[0].payload.url;
    response = {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [
            {
              title: "Is this the right picture?",
              subtitle: "Tap a button to answer.",
              image_url: attachment_url,
              buttons: [
                {
                  type: "postback",
                  title: "Yes!",
                  payload: "yes"
                },
                {
                  type: "postback",
                  title: "No!",
                  payload: "no"
                }
              ]
            }
          ]
        }
      }
    };
    // Send the response message
    callSendAPI(sender_psid, response);
  }
}

function greetUser(sender_psid) {
  request(
    {
      url: `${FACEBOOK_GRAPH_API_BASE_URL}${sender_psid}`,
      qs: {
        access_token: process.env.PAGE_ACCESS_TOKEN,
        fields: "first_name"
      },
      method: "GET"
    },
    function(error, response, body) {
      var greeting = "";
      if (error) {
        console.log("Error getting user's name: " + error);
      } else {
        var bodyObj = JSON.parse(body);
        const name = bodyObj.first_name;
        if (name) {
          greeting = "Hi " + name + ". ";
          const client = new MongoClient(MONGODB_URI, {
            useNewUrlParser: true
          });
          client.connect(err => {
            if (!err) {
              const collection = client
                .db("native_teacher")
                .collection("users");
              collection.findOneAndUpdate(
                { psid: sender_psid },
                { psid: sender_psid, name: name, language: "english" },
                { upsert: true }
              );
            } else {
              console.log(err);
            }
            client.close();
          });
        }
      }
      const message =
        greeting +
        "Welcome to Native Teacher a bot to help connect you to someone who wants to learn your language and teach you their language?";
      const greetingPayload = {
        text: message
      };
      callSendAPI(sender_psid, greetingPayload);
    }
  );
}

function callSendAPI(sender_psid, response) {
  // Construct the message body
  let request_body = {
    recipient: {
      id: sender_psid
    },
    message: response
  };

  // Send the HTTP request to the Messenger Platform
  request(
    {
      uri: "https://graph.facebook.com/v2.6/me/messages",
      qs: { access_token: process.env.PAGE_ACCESS_TOKEN },
      method: "POST",
      json: request_body
    },
    (err, res, body) => {
      if (!err) {
        console.log("message sent!");
      } else {
        console.error("Unable to send message:" + err);
      }
    }
  );
}

function handlePostback(sender_psid, received_postback) {
  let response;

  // Get the payload for the postback
  let payload = received_postback.payload;

  // Set the response based on the postback payload
  if (payload === "yes") {
    response = { text: "Thanks!" };
  } else if (payload === "no") {
    response = { text: "Oops, try sending another image." };
  }
  // Send the message to acknowledge the postback
  callSendAPI(sender_psid, response);
}

function containsUser(sender_psid) {
  return false;
}

function containsLanguage(sender_psid) {
  return false;
}

function containsLanguagePair(sender_psid) {
  return false;
}

function containsMatch(sender_psid) {
  return false;
}
