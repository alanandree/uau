const express = require('express');
const multer = require('multer');
const path = require('path');

const upload = multer({ dest: require('os').tmpdir() });

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.post('/test', upload.single('foto'), (req, res) => {
  console.log('BODY:', req.body);
  console.log('FILE:', req.file ? req.file.originalname : 'NO FILE');
  res.json({ body: req.body, file: req.file ? req.file.originalname : null });
});

app.listen(3004, () => {
  const http = require('http');
  const boundary = '----FormBoundary';
  const body = 
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="nome"\r\n\r\n' +
    'Joao\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="foto"; filename="foto.png"\r\n' +
    'Content-Type: image/png\r\n\r\n' +
    'fakeimagedata\r\n' +
    '--' + boundary + '--\r\n';

  const req = http.request({
    hostname: 'localhost',
    port: 3004,
    path: '/test',
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=' + boundary,
      'Content-Length': Buffer.byteLength(body)
    }
  }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      console.log('RESPONSE:', data);
      process.exit();
    });
  });
  req.write(body);
  req.end();
});
