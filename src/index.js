'use strict';

var AWS = require('aws-sdk');
var config = require('./config');
AWS.config.update({
  accessKeyId: config.aws.accessKeyId,
  secretAccessKey: config.aws.secretAccessKey,
  region: config.aws.region
});
var s3 = new AWS.S3();
var moment = require('moment');
var fileType = require('file-type');
var MongoClient = require('mongodb').MongoClient;
let mlab_connection_uri;
var log =[];
var bucket = config.aws.bucket;

exports.handler = async function(event, context, callback) {
    var uri = config.mongoDB.URL;
    log = []
    mlab_connection_uri = uri;
    const file = await uploadImage(event, context, callback);
    // let resp = {
    //   logdata: log,
    //   filedata : file
    // };
    // callback(null, resp);
    callback(null, file);

}

const uploadImage = (event, context, callback) => new Promise((resolve, reject) => {
  var jsonContents = JSON.parse(JSON.stringify(event));

  var imageData = [];

  if (jsonContents.base64String != null) {
      let len = jsonContents.base64String.length;
      for (var i = 0; i < len; i++) {
          let buffer = new Buffer(jsonContents.base64String[i], 'base64');
          let host = s3.endpoint.protocol + s3.endpoint.pathname + s3.endpoint.path + s3.endpoint.host;
          var fileMime = fileType(buffer);
          log.push(`uploading... file ${i}`);
          let file = getFile(fileMime, buffer, host, jsonContents.groupId);
          let params = file.params;
          imageData.push({
            imagepath : file.uploadFile.full_path,
            group_id  : jsonContents.groupId,
            user_id   : jsonContents.userId,
            isactive  : 1,
            created_at: new Date()
          });
          log.push({
            imagepath : file.uploadFile.full_path,
            group_id  : jsonContents.groupId,
            user_id   : jsonContents.userId,
            isactive  : 1,
            created_at: new Date()
          })
          uploadToBucket(params);
          log.push(`file upload completed...${i}`)
      }
  }
  log.push("file uploaded in bucket");
  try {
      MongoClient.connect(mlab_connection_uri, function (err, db) {
          if (err) {
              log.push(`the MongoClient.connect() error is ${err}.`, err)
              process.exit(1)
          } else {
            log.push('create new connection..');
              resolve(createDoc(db, imageData, callback));
          }
      });
  }
  catch (err) {
      console.error('an error occurred', err);
  }
});

const createDoc = (database, json, callback) => new Promise((resolve, reject) => {
  const myDBName = database.db(config.mongoDB.dbName);
  log.push(`\nuploading fil in db..`);
  myDBName.collection('photo').insertMany(json, function (err, result) {
      if (err != null) {
          console.error("an error occurred in createDoc", err);
          database.close();
          reject(JSON.stringify(err));
      }
      else {
          var message = {
              "success"   : true,
              "statusCode": 200,
              "message"   : "image uploaded successfully.",
              "data"      : result.ops
          };
          log.push(`\nupload file complete in DB..`);
          database.close();
          resolve(message);
      }
  });
});
// function createDoc(database, json, callback) {
//     const myDBName = database.db(config.mongoDB.dbName);
//     myDBName.collection('photo').insertMany(json, function (err, result) {
//         if (err != null) {
//             console.error("an error occurred in createDoc", err);
//             callback(null, JSON.stringify(err));
//         }
//         else {
//             var message = {
//                 "success"   : true,
//                 "statusCode": 200,
//                 "message"   : "image uploaded successfully.",
//                 "data"      : result.ops[0]
//             };
//             callback(null, message);
//         }
//         //we don't want to close the connection since we set context.callbackWaitsForEmptyEventLoop to false (see above)
//         //this will let our function re-use the connection on the next called (if it can re-use the same Lambda container)
//         //db.close();
//     });
// };
const uploadToBucket = (img) => new Promise((resolve, reject) => {
  s3.putObject(img, function(err, data) {
      if(err) {
          var message = {
              "success"   : false,
              "statusCode": 401,
              "message"   : "image not uploaded successfully.",
              "data"      : err
          };
          reject(message);
      } else {
          resolve(data);
      }
  });
});

function getFile(fileMime, buffer, host, directory) {
    let fileExt = fileMime.ext;
    let now = moment().format('x');

    let filePath = directory + '/';
    let fileName = now+ '.' + fileExt;
    let fileFullName = filePath + fileName;
    let fileFullPath = host + '/' + bucket + '/' + fileFullName;

    let params = {
        Bucket: bucket,
        Key: fileFullName,
        Body: buffer,
        ContentType: fileMime.mime,
        ACL: 'public-read'
    };

    let uploadFile = {
        size: buffer.toString('ascii').length,
        type: fileMime.mime,
        name: fileName,
        full_path: fileFullPath,
    }
    log.push(uploadFile)
    return {
        'params': params,
        'uploadFile': uploadFile
    }
}
