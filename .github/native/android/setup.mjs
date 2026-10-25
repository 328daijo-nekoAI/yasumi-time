// `npx cap add android` のあとに実行して、やすみタイム専用の部品を Android プロジェクトへ入れます。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, 'android', 'app', 'src', 'main');
const javaDir = path.join(app, 'java', 'com', 'yasumi', 'app');
if (!fs.existsSync(app)) { console.error('android プロジェクトが見つかりません。先に npx cap add android を実行してください'); process.exit(1); }

// 1) Java ファイル（MainActivity は置きかえ）
fs.mkdirSync(javaDir, { recursive: true });
for (const f of ['MainActivity.java', 'YasumiLockPlugin.java', 'AdminReceiver.java']) {
  fs.copyFileSync(path.join(here, 'overlay', f), path.join(javaDir, f));
}

// 2) 端末ロック権限の設定ファイル
const xmlDir = path.join(app, 'res', 'xml');
fs.mkdirSync(xmlDir, { recursive: true });
fs.writeFileSync(path.join(xmlDir, 'device_admin.xml'),
  '<?xml version="1.0" encoding="utf-8"?>\n<device-admin xmlns:android="http://schemas.android.com/apk/res/android">\n  <uses-policies>\n    <force-lock />\n  </uses-policies>\n</device-admin>\n');

// 3) AndroidManifest.xml に「yasumi://auth で戻ってくる受け口」と「端末ロックの受信設定」を追加
const mf = path.join(app, 'AndroidManifest.xml');
let x = fs.readFileSync(mf, 'utf8');
if (!x.includes('android:scheme="yasumi"')) {
  const filter = [
    '            <intent-filter>',
    '                <action android:name="android.intent.action.VIEW" />',
    '                <category android:name="android.intent.category.DEFAULT" />',
    '                <category android:name="android.intent.category.BROWSABLE" />',
    '                <data android:scheme="yasumi" android:host="auth" />',
    '            </intent-filter>',
    '        </activity>'
  ].join('\n');
  if (!x.includes('</activity>')) { console.error('AndroidManifest.xml に </activity> が見つかりません'); process.exit(1); }
  x = x.replace('</activity>', filter);
}
if (!x.includes('AdminReceiver')) {
  const receiver = [
    '        <receiver android:name=".AdminReceiver" android:exported="true" android:permission="android.permission.BIND_DEVICE_ADMIN">',
    '            <meta-data android:name="android.app.device_admin" android:resource="@xml/device_admin" />',
    '            <intent-filter>',
    '                <action android:name="android.app.action.DEVICE_ADMIN_ENABLED" />',
    '            </intent-filter>',
    '        </receiver>',
    '    </application>'
  ].join('\n');
  x = x.replace('</application>', receiver);
}
fs.writeFileSync(mf, x);
console.log('Android の設定を追加しました');
