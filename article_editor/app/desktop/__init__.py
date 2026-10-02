"""데스크톱 셸 패키지 (pywebview 창 + 코어 서버 런타임).

PyInstaller는 네임스페이스 패키지보다 일반 패키지를 안정적으로 번들하므로
이 파일이 있어야 ``from desktop import shell`` 이 배포본에서도 확실히 동작한다.
"""
