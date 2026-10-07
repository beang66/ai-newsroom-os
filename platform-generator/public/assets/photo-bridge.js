import './photo-tools.js';
// 팀원 사진 컴포넌트와 현재 카드 편집기 사이의 연결만 담당합니다.
const tools = document.querySelector('.photo-tools');
if (tools) {
  // 카드 draw()가 매번 갱신하는 출처 영역을 보존합니다.
  // 버튼을 교체할 때 이 요소까지 지우면 replaceChildren 오류가 발생합니다.
  const credit = tools.querySelector('#photo-credit') || document.createElement('div');
  credit.id = 'photo-credit';
  tools.replaceChildren();
  const dialog=document.createElement('dialog');
  dialog.style.cssText='width:min(1100px,96vw);max-height:94vh;overflow:auto;border:0;border-radius:12px;';
  const close=document.createElement('button');close.textContent='사진 창 닫기';
  const picker=document.createElement('photo-tools');
  dialog.append(close,picker);document.body.append(dialog);
  let target=null;
  function open(mode='search'){
    // 비동기 선택 중 active가 바뀌어도 처음 지정한 카드에 적용합니다.
    picker.controller.abort();
    picker.controller=new AbortController();
    picker.sessionToken=(picker.sessionToken||0)+1;
    target=current();
    picker.articleText=window.NewsInput?.getRequest().article.content||'';
    picker.selectedPhoto=target.image?.photo_edit?structuredClone(target.image.photo_edit):null;
    picker.mode='edit';picker.render();
    if(!dialog.open)dialog.showModal();
    if(mode==='edit'){
      if(picker.selectedPhoto)picker.openEditor(picker.selectedPhoto);
      else picker.notice('이 사진에는 편집 원본이 없습니다. 팀원 사진 도구에서 다시 선택해주세요.');
    } else if(mode==='upload')picker.choosePhotoFile();
    else picker.media();
  }
  function finish(){picker.sessionToken=(picker.sessionToken||0)+1;picker.controller.abort();picker.mode='edit';picker.closeModal();dialog.close();target=null;}
  close.onclick=finish;
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish();});
  picker.addEventListener('photo-selected',event=>{
    // 재생성·불러오기로 같은 ID의 새 카드가 생겨도 이전 객체에 적용하지 않습니다.
    if(!target||!state.cards.includes(target)){picker.notice('대상 카드가 변경되었습니다. 사진 창을 닫고 다시 선택해주세요.');return;}
    const photo=event.detail;
    const url=CardTemplate.validImage(photo.data);
    if(!url){picker.notice('지원하지 않는 사진 형식입니다.');return;}
    target.image={
      // 편집하지 않은 Unsplash 사진은 공식 URL로 표시합니다.
      url:photo.unsplashId&&!photo.crop&&!photo.masks?.length?CardTemplate.validImage(photo.remoteOriginal)||url:url,
      photographer:photo.photographer||'',profile:photo.profile||'',
      source:photo.source||'',sourceUrl:photo.sourceUrl||'',
      photo_edit:structuredClone(photo),
    };
    dirty(false);draw();finish();
  });
  function add(text,action){const button=document.createElement('button');button.type='button';button.textContent=text;button.onclick=action;tools.append(button);}
  add('사진 검색하기',()=>open('search'));
  add('내 사진 첨부하기',()=>open('upload'));
  add('현재 사진 다시 편집',()=>open('edit'));
  add('검정 배경으로 변경',()=>{delete current().image;dirty(false);draw();});
  tools.append(credit);
  window.TeamPhotos={open};
}
