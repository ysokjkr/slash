'use strict';

// 暗号化頑張る
// const SALT_WORK_FACTOR = 10;

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    id : { type: String, required: true, unique: true },
    token: { type: String, required: true },
});

module.exports = mongoose.model('User', UserSchema);