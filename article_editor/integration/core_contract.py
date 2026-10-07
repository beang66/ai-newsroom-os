"""Pure v0.8 DTO adapters. No DB, HTTP server, authentication or global IDs."""
import datetime
import copy
import hashlib
import json
import re
import uuid
from html.parser import HTMLParser

CONTRACT_VERSION='0.8.1'
LIFECYCLE_STATUSES=('queued','running','succeeded','failed','cancelled')

class ContractError(ValueError):pass

def uuid_text(value):
    if not isinstance(value,str):raise ContractError('UUID string required')
    try:return str(uuid.UUID(value))
    except ValueError as e:raise ContractError('Invalid UUID') from e

def legacy_uuid(entity, value, namespace, system='app-core'):
    if not namespace:raise ContractError('Team UUID v5 namespace required for legacy mapping; no invented default')
    if not isinstance(value,str) or not value:raise ContractError('Legacy ID required')
    return str(uuid.uuid5(uuid.UUID(uuid_text(namespace)),f'{system}:{entity}:{value}'))

class TextParser(HTMLParser):
    def __init__(self):super().__init__(convert_charrefs=True);self.parts=[];self.skip=0
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style','s','del','figure'):self.skip+=1
        if not self.skip and tag in ('p','div','br','li'):self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style','s','del','figure') and self.skip:self.skip-=1
        elif not self.skip and tag in ('p','div','li'):self.parts.append('\n')
    def handle_data(self,data):
        if not self.skip:self.parts.append(data)

def text_of(html):
    p=TextParser();p.feed(html or '')
    return re.sub(r'\n{2,}','\n',''.join(p.parts)).strip()

def article_id(draft, namespace=None):
    context=draft.get('core_context',{})
    if context.get('article_id'):return uuid_text(context['article_id'])
    return legacy_uuid('article',draft['articleId'],namespace)

def revision_input(draft, expected_revision_no=None):
    if not isinstance(draft,dict) or not isinstance(draft.get('bodyHtml'),str):raise ContractError('Draft bodyHtml required')
    # Editor-only fields stay in the field explicitly allowed by OpenAPI.
    editor=copy.deepcopy({k:v for k,v in draft.items() if k not in ('articleId','title','bodyHtml','core_context')})
    editor['title_html']=draft.get('title','')
    editor['legacy_article_id']=draft.get('articleId')
    editor['media_asset_ids']=[uuid_text(p['core_context']['media_asset_id']) for p in draft.get('photos',[]) if p.get('core_context',{}).get('media_asset_id')]
    payload={'title':text_of(draft.get('title','')),'body_html':draft['bodyHtml'],'body_text':text_of(draft['bodyHtml']),'editor_state':editor}
    if expected_revision_no is not None:
        if not isinstance(expected_revision_no,int) or expected_revision_no<0:raise ContractError('Invalid expected_revision_no')
        payload['expected_revision_no']=expected_revision_no
    return payload

def draft_to_article(draft, workspace_id, namespace=None):
    return {'id':article_id(draft,namespace),'workspace_id':uuid_text(workspace_id),'title':text_of(draft.get('title','')),
            'status':'draft',**({'legacy_id':draft['articleId']} if draft.get('articleId') else {})}

def revision_to_draft(article, revision):
    aid=uuid_text(article['id']);wid=uuid_text(article['workspace_id'])
    if uuid_text(revision['article_id'])!=aid:raise ContractError('Revision belongs to another article')
    rid=uuid_text(revision['id'])
    editor=copy.deepcopy(revision.get('editor_state',{}))
    return {**editor,'articleId':uuid.UUID(aid).hex,'title':editor.get('title_html',revision['title']),
            'subtitle':editor.get('subtitle',''),'bodyHtml':revision['body_html'],'photos':editor.get('photos',[]),
            'core_context':{'workspace_id':wid,'article_id':aid,'revision_id':rid,'revision_no':revision['revision_no']}}

def version_to_revision(record,workspace_id,namespace):
    if record.get('internal') or not isinstance(record.get('versionNumber'),int) or record['versionNumber']<1:raise ContractError('Internal recovery backups are not ArticleRevisions')
    uuid_text(workspace_id)
    draft=record['draft'];payload=revision_input(draft)
    return {**payload,'id':legacy_uuid('revision',record['versionId'],namespace),
            'article_id':article_id(draft,namespace),'revision_no':record['versionNumber'],'created_at':record['createdAt']}

def photo_to_media(photo,workspace_id,namespace=None):
    context=photo.get('core_context',{})
    identifier=context.get('media_asset_id')
    if identifier:identifier=uuid_text(identifier)
    else:identifier=legacy_uuid('media_asset',photo['id'],namespace)
    location=photo.get('original') or photo.get('data') or ''
    sha=re.search(r'/api/article-assets/([a-f0-9]{64})$',location)
    object_ref='local:sha256:'+sha.group(1) if sha else location
    if not object_ref or object_ref.startswith('data:'):raise ContractError('Store original bytes through Core Media Repository before registration')
    if re.match(r'https?://(?:localhost|127\.0\.0\.1)(?::\d+)?/',object_ref):raise ContractError('Localhost URL cannot be the shared media identity')
    return {'id':identifier,'workspace_id':uuid_text(workspace_id),'kind':'image','object_ref':object_ref,
            'mime_type':photo.get('mime_type','image/jpeg'),'filename':photo.get('filename',''),
            'caption':photo.get('caption',''),'generated':bool(photo.get('generated',False)),
            'created_at':photo.get('createdAt') or context.get('created_at') or datetime.datetime.now(datetime.timezone.utc).isoformat()}

def media_to_photo(media,render_uri=None):
    return {'id':uuid_text(media['id']),'data':render_uri or media.get('local_uri') or media['object_ref'],
            'original':render_uri or media.get('local_uri') or media['object_ref'],'caption':media.get('caption',''),
            'generated':media.get('generated',False),'mime_type':media['mime_type'],
            'core_context':{'media_asset_id':uuid_text(media['id']),'workspace_id':uuid_text(media['workspace_id']),'created_at':media['created_at']}}

def error_envelope(error,request_id=None):
    body={'code':'ARTICLE_WORKSPACE_ERROR','message':str(error),'retryable':not isinstance(error,ContractError)}
    if request_id:body['request_id']=request_id
    return {'error':body}
