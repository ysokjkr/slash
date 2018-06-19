'use strict';
require('dotenv').config();
const express = require('express');
const app = express();
const request = require('request');
const bodyParser = require('body-parser');
const HttpsProxyAgent = require('https-proxy-agent');
const { WebClient } = require('@slack/client');

const iineEmojiList = require('./app/emojiList');

// DB接続
const mongoose = require('mongoose');
const mongo_url = process.env.MONGODB_URI;
mongoose.connect(mongo_url);
// モデルの宣言
const User = require('./app/models/user');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const port = process.env.PORT || 4390; // local環境でngrokのhttpsを受けるport 4390;
const proxyUrl = process.env.FIXIE_URL || 'http://12.34.56.78:9999';

app.post('/slash', (req, res) => {
    const { command, text, user_id: id, channel_id: channelId, } = req.body;
    // console.log(req.body);
    switch(command) {
        case '/stamp':
            const emojiName = text && text.replace(/:([^:]+):/, '$1');
            postEmojiAsAttachemt(id, channelId, emojiName).catch(res.send('Please set *custom* emoji name. e.g. /stamp :shirokuma :pray:').status(200).end());
            break;
        case '/iine':
            const num = text && text.replace(/^'(\d)'/, '$1');
            if (!num || num < 0 || 20 < num) return res.send('Please set number from 1 to 20. :pray:').status(200).end();
            const emojiNameList = [];
            while (emojiNameList.length != num) {
                const index = Math.floor(Math.random() * iineEmojiList.length);
                if (emojiNameList.indexOf(iineEmojiList[index]) === -1) emojiNameList.push(iineEmojiList[index]);
            }
            postEmojiReaction(id, channelId, emojiNameList);
            break;
    }
    return res.status(200).end();
});

async function postEmojiAsAttachemt(userId, channelId, emojiName){
    const user = await findUser(userId);
    const slackClient = new WebClient(user.token, { agent: new HttpsProxyAgent(proxyUrl) });
    const emojiUrl = await getEmojiUrl(slackClient, emojiName);
    console.log(emojiUrl);
    if (!emojiUrl) throw new Error(`${emojiName} is missing or an error has occurred.`);
    const postMsg = { 
        channel: channelId, 
        as_user: true,
        text: '',
        attachments: [{
            color: '#fff',
            text: '',
            image_url: emojiUrl,
        }],
    };  
    slackClient.chat.postMessage(postMsg).then((res) => {
        console.log('Message sent: ', res.ts);
    }).catch((e) =>console.log(e));
};

async function postEmojiReaction(userId, channelId, emojiNameList){
    const user = await findUser(userId);
    const slackClient = new WebClient(user.token, { agent: new HttpsProxyAgent(proxyUrl) });
    const targetMsg = await getLatestPublicAction(slackClient, channelId);
    const postMsg = { 
        as_user: true,
    };
    switch(targetMsg.subtype) {
        case 'file_comment':
            postMsg.file_comment = targetMsg.comment.id;
            break;
        case 'file_share':
            postMsg.file = targetMsg.file.id;
            break;
        default:
            postMsg.channel = channelId;
            postMsg.timestamp = targetMsg.ts;
    }
    emojiNameList.forEach(emojiName => {
        postMsg.name = emojiName;
        slackClient.reactions.add(postMsg).then((res) => {
            console.log('Message sent: ', res.ts);
        });
    });
};

async function findUser(userId) {
    const user = await User.findOne({ id: userId });
    if (!user) throw new Error(`You are not authorized. Please sign up from ${process.env.URL}`);
    return user;
}

async function getEmojiUrl(slackClient, emojiName){
    const { emoji } = await slackClient.emoji.list();
    if (!emoji || !emoji[emojiName]) throw new Error(`${emojiName} is missing or an error has occurred. please try again :pray:`);
    return emoji[emojiName];
}

async function getLatestPublicAction(slackClient, channelId){
    const postMsg = { 
        channel: channelId, 
        count: 1,
    };  
    const { messages } = await slackClient.channels.history(postMsg);
    return messages[0];
};

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUrl = process.env.REDIRECT_URL;

// slack認証ボタン表示
app.get('/auth', (req, res) =>{
    res.sendFile(__dirname + '/add_to_slack.html')
});

app.get('/auth/redirect', (req, res) =>{
    const options = {
        uri: 'https://slack.com/api/oauth.access?code='
            +req.query.code+
            '&client_id='+clientId+
            '&client_secret='+clientSecret+
            '&redirect_uri='+ redirectUrl,
        method: 'GET',
        proxy: pproxyUrl
    }
    request(options, (error, response, body) => {
        const { ok, user_id: id, access_token: token } = JSON.parse(body);
        if (!ok) return res.send("Error encountered: \n"+body).status(200).end();
        User.update({ id }, { id, token }, { upsert: true }, (err) => {
            if (err) {
                res.send("Error encountered. Please try agein.").status(200).end();
            } else {
                res.send("Success!").status(200).end();
            }
        });
    });
});

//サーバ起動
app.listen(port);
console.log('listen on port ' + port);
