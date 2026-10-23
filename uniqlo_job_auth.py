"""Short-lived signatures grant only the exact TEST daily-sync operation."""
import hashlib
import hmac
import os
import time


def sign_job_token(key, timestamp=None):
    stamp=str(int(time.time() if timestamp is None else timestamp))
    signature=hmac.new(key.encode('ascii'),('uniqlo-test-daily:'+stamp).encode('ascii'),hashlib.sha256).hexdigest()
    return 'v1:'+stamp+':'+signature


def valid_job_key(value):
    expected=os.getenv('UNIQLO_JOB_KEY','')
    if len(expected)<32 or not expected.isascii() or len(value)>160:
        return False
    try:
        version,stamp,signature=value.split(':')
        if version!='v1' or not stamp.isascii() or not stamp.isdecimal() or len(stamp)>12:
            return False
        age=time.time()-int(stamp)
        if not -30<=age<=300:
            return False
        return value.isascii() and hmac.compare_digest(value,sign_job_token(expected,int(stamp)))
    except (ValueError,TypeError,UnicodeError):
        return False
