# ERD 이미지 출처

원본은 사용자가 제공한 [Deathmatch Online ERD.html](<../../Deathmatch Online ERD.html>)입니다. 원본 파일의 바이트는 수정하지 않았습니다.

- `deathmatch-online-erd-from-html.svg`: 원본의 관계도 SVG를 추출해 어두운 배경·이미지 설명·정사각형 내보내기 여백을 추가했습니다. 테이블·컬럼·연결선의 내용은 원본을 따릅니다.
- `deathmatch-online-erd-from-html.png`: 위 SVG를 macOS Quick Look으로 1,800px 썸네일 렌더링한 파일입니다. 전체 관계도를 시각 확인했습니다.

이 파일들은 **HTML에서 내보낸 관계도이며 채팅 첨부 사진 원본은 아닙니다.** 범례·하단의 정책 설명·값 표는 HTML 원본과 [DB 명세](../../DATABASE.md)에 남아 있습니다. 첨부 원본 파일 경로가 확보되면 원본은 변환 없이 별도 보관합니다.

내보내기 예시입니다. 원본 HTML을 다시 렌더링해 코드/구조가 바뀌지 않았는지 확인한 뒤 사용합니다.

```sh
qlmanage -t -s 1800 -o /tmp docs/database/assets/deathmatch-online-erd-from-html.svg
```
