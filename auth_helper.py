#!/usr/bin/env python3
"""
Telegram auth helper using Telethon.
Called by the Node.js API via child_process.
Commands: request_otp, verify_otp, verify_2fa
"""
import asyncio
import sys
import json
import os
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import SessionPasswordNeededError, PhoneCodeInvalidError, PhoneCodeExpiredError

API_ID = int(os.environ.get('TELEGRAM_API_ID', '10213775'))
API_HASH = os.environ.get('TELEGRAM_API_HASH', '10177b03e1db0f6d99e2e2f3f8ed9450')
SESSIONS_PATH = os.environ.get('SESSIONS_PATH', '/root/agentr/sessions')

def get_session_file(tenant_id):
    return os.path.join(SESSIONS_PATH, f'{tenant_id}.session')

def load_session(tenant_id):
    sf = get_session_file(tenant_id)
    if os.path.exists(sf):
        with open(sf) as f:
            return f.read().strip()
    return ''

def save_session(tenant_id, session_string):
    sf = get_session_file(tenant_id)
    os.makedirs(os.path.dirname(sf), exist_ok=True)
    with open(sf, 'w') as f:
        f.write(session_string)

async def request_otp(tenant_id, phone):
    session_str = load_session(tenant_id)
    client = TelegramClient(StringSession(session_str), API_ID, API_HASH)
    await client.connect()
    result = await client.send_code_request(phone)
    # Save partial session
    save_session(tenant_id, client.session.save())
    await client.disconnect()
    return {'success': True, 'phone_code_hash': result.phone_code_hash}

async def verify_otp(tenant_id, phone, phone_code_hash, code):
    session_str = load_session(tenant_id)
    client = TelegramClient(StringSession(session_str), API_ID, API_HASH)
    await client.connect()
    try:
        await client.sign_in(phone, code, phone_code_hash=phone_code_hash)
        save_session(tenant_id, client.session.save())
        await client.disconnect()
        return {'success': True}
    except SessionPasswordNeededError:
        await client.disconnect()
        return {'success': False, 'error': '2FA_REQUIRED'}
    except (PhoneCodeInvalidError, PhoneCodeExpiredError) as e:
        await client.disconnect()
        return {'success': False, 'error': 'PHONE_CODE_INVALID'}

async def verify_2fa(tenant_id, password):
    session_str = load_session(tenant_id)
    client = TelegramClient(StringSession(session_str), API_ID, API_HASH)
    await client.connect()
    try:
        await client.sign_in(password=password)
        save_session(tenant_id, client.session.save())
        await client.disconnect()
        return {'success': True}
    except Exception as e:
        await client.disconnect()
        return {'success': False, 'error': str(e)}

async def main():
    data = json.loads(sys.stdin.read())
    cmd = data['cmd']
    
    if cmd == 'request_otp':
        result = await request_otp(data['tenantId'], data['phone'])
    elif cmd == 'verify_otp':
        result = await verify_otp(data['tenantId'], data['phone'], data['phoneCodeHash'], data['code'])
    elif cmd == 'verify_2fa':
        result = await verify_2fa(data['tenantId'], data['password'])
    else:
        result = {'success': False, 'error': f'Unknown command: {cmd}'}
    
    print(json.dumps(result))

asyncio.run(main())
