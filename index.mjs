import axios from 'axios';
import { Storage } from '@google-cloud/storage';
import formData from 'form-data';
import Mailgun from 'mailgun.js';
import AWS from 'aws-sdk';
const mailgun = new Mailgun(formData);
const dynamoDB = new AWS.DynamoDB.DocumentClient();

const storage = new Storage({
    credentials: JSON.parse(process.env.PRIVATE_KEY)
});

export const handler = async (event) => {
    const message = JSON.parse(event.Records[0].Sns.Message)
    const GCS_BUCKET = process.env.BUCKET_NAME;
    const assignmentId = message.assignment_id;
    const no_of_attempts = message.num_attempts;
    const url = message.sub_url;
    
    const fileName = url.substring(url.lastIndexOf('/')+1);
    const fileloc = "Assignment-" + assignmentId + "/" + message.email + "/" + no_of_attempts + "/" + fileName;
    
    try{
        const bucketObj = storage.bucket(GCS_BUCKET)
        const file = bucketObj.file(fileloc);
        const fileCon = await downloadFile(url);
        await file.save(fileCon);
        console.log("file uploaded successfully")
        const mail_html = `<p>Your Submisson for Assignment: ${message.assignment_name}, Attempt: ${message.num_attempts} was uploaded successfully.</p><p>Path in gcp bucket: ${fileloc}`
        const result = await sendMail(message.email, `Upload successful for ${message.assignment_name}`, mail_html);
        console.log(result)
        await trackEmail(result.id,message.email,mail_html);
    }
    catch(error){
        console.log("Could not download the file")
        const mail_html = `<p>There was an issue with your submission for Assignment: ${message.assignment_name}. Please check your URL, the file could not be downloaded.</p>`
        const result = await sendMail(message.email,`Upload failed for ${message.assignment_name}`, mail_html);
        console.log(result)
        await trackEmail(result.id,message.email,mail_html);
    }
    
    const response = {
        statusCode: 200,
        body: JSON.stringify('Hello from Lambda!'),
    };
    return response;
};

async function downloadFile(url) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data, 'binary');
}

async function sendMail(to, subject, html){
    const mg = mailgun.client({username: 'api', key: process.env.MAILGUN_API_KEY });
    try {
        const result = await mg.messages.create(process.env.DNS_NAME, {
            from: `Webapp Application <webapp@${process.env.DNS_NAME}>`,
            to: [to],
            subject: subject,
            html: html
        })
        return result
    } catch(err) {
        console.log(err);
    }
}

async function trackEmail(message_id,to,message_body){
    const params = {
        TableName: process.env.DYNAMODB_TABLE_NAME,
        Item: {
            message_id: message_id,
            email: to,
            message_body: message_body,
            timestamp: new Date().toISOString(),
        },
    };
    
    try {
        await dynamoDB.put(params).promise();
        console.log(`Email tracked for ${to}`);
    } catch (err) {
        console.error(`Error tracking email: ${err}`);
    }
}