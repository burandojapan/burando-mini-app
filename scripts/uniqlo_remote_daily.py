"""Small Render cron caller. No database credentials, cookies or admin keys."""
import json
import os
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def main():
    url=os.environ.get('UNIQLO_JOB_URL','')
    key=os.environ.get('UNIQLO_JOB_KEY','')
    parsed=urlsplit(url)
    if (parsed.scheme!='https' or parsed.hostname!='burando-v7-staging.onrender.com'
            or parsed.port not in {None,443} or parsed.username or parsed.password
            or parsed.path!='/api/internal/uniqlo/daily' or parsed.query or parsed.fragment
            or len(key)<32):
        print('Invalid TEST job configuration')
        return 1
    request=urllib.request.Request(url,data=b'{}',method='POST',headers={
        'Content-Type':'application/json','X-Uniqlo-Job-Key':key})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request,timeout=600) as response:
            data=json.loads(response.read(65537))
        if data.get('status') not in {'success','partial','paused'}:
            raise ValueError()
        print(json.dumps({k:data.get(k) for k in ('status','run_id','imported','errors')}))
        return 1 if data['status']=='partial' else 0
    except urllib.error.HTTPError as exc:
        print('Daily sync HTTP failure:',exc.code)
    except (urllib.error.URLError,ValueError,TimeoutError):
        print('Daily sync unavailable; check Render and sync history')
    return 1

if __name__=='__main__':
    sys.exit(main())
