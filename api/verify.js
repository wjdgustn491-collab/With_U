/**
 * 환경표지 인증 검증 프록시 (Vercel Serverless Function)
 *
 * 왜 프록시가 필요한가:
 *   1) data.go.kr 은 CORS 헤더를 주지 않아 브라우저에서 직접 fetch 불가
 *   2) serviceKey 를 프론트엔드에 두면 소스보기로 그대로 노출됨
 *   3) 응답이 XML 이라 프론트에서 다루기 번거로움 -> 여기서 JSON 으로 정규화
 *
 * 데이터 출처(공식):
 *   한국환경산업기술원_환경표지인증 해지취소 제품 조회 GW
 *   https://www.data.go.kr/data/15158373/openapi.do
 *
 * 환경변수:
 *   DATA_GO_KR_KEY = 공공데이터포털 "일반 인증키 (Decoding)"
 */

'use strict';

var BASE =
  'https://apis.data.go.kr/B552518' +
  '/EnvironmentSignalRecognitionRetractionInquiryService/getServiceList';

// 개발계정 일일 트래픽이 100건이라 같은 질의를 반복 호출하지 않도록 짧게 캐시
var CACHE_TTL_MS = 5 * 60 * 1000;
var cache = new Map();

/** XML 태그 하나의 값을 뽑는다. CDATA 도 처리. */
function tag(xml, name) {
  var m = new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>').exec(xml);
  if (!m) return '';
  return m[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1').trim();
}

/** 반복되는 <dataEL>...</dataEL> 블록을 배열로 뽑는다. */
function blocks(xml, name) {
  var re = new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>', 'g');
  var out = [];
  var m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

/**
 * dataEL 필드 매핑.
 * 포털 명세가 축약 필드명만 주고 한글 설명이 없어서, 명세의 설명
 * ("인증제품명, 인증기간, 인증제품 용도, 인증번호, 인증기업명, 해지/취소일")
 * 을 기준으로 대응시킨 것. 실제 키로 1회 호출해 확인 후 확정할 것.
 */
function normalizeItem(b) {
  return {
    rnum: tag(b, 'rnum'),
    productName: tag(b, 'prodPrnm'), // 인증제품명
    model: tag(b, 'prodMdel'),       // 모델명
    certNo: tag(b, 'prodRsid'),      // 인증번호
    company: tag(b, 'vendVcnm'),     // 인증기업명
    usage: tag(b, 'prodInrs'),       // 인증제품 용도
    reason: tag(b, 'prodRson'),      // 해지/취소 사유
    certFrom: tag(b, 'prodRsdt'),    // 인증 시작일
    certTo: tag(b, 'prodRedt'),      // 인증 종료일
    revokedAt: tag(b, 'prodRtdt')    // 해지/취소일
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  var key = process.env.DATA_GO_KR_KEY;
  var query = String((req.query && req.query.serial) || '').trim();

  // 헬스체크: 상태 표시등이 이걸로 실제 연결 여부를 판단한다
  if (!query) {
    return res.status(200).json({
      configured: Boolean(key),
      source: '한국환경산업기술원 (KEITI) 환경표지인증',
      dataset: 'https://www.data.go.kr/data/15158373/openapi.do'
    });
  }

  if (!key) {
    // 키가 없으면 조용히 목업으로 넘어가지 않고, 미설정 사실을 그대로 알린다
    return res.status(503).json({
      configured: false,
      error: 'DATA_GO_KR_KEY 환경변수가 설정되지 않았습니다.'
    });
  }

  var cached = cache.get(query);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return res.status(200).json(Object.assign({ cached: true }, cached.payload));
  }

  var url =
    BASE +
    '?serviceKey=' + encodeURIComponent(key) +
    '&pageNo=1' +
    '&numOfRows=20' +
    '&prodValue=' + encodeURIComponent(query);

  try {
    var upstream = await fetch(url, { headers: { Accept: 'application/xml' } });
    var xml = await upstream.text();

    if (!upstream.ok) {
      return res.status(502).json({
        configured: true,
        error: 'KEITI API 응답 오류 (HTTP ' + upstream.status + ')',
        detail: xml.slice(0, 300)
      });
    }

    var resultCode = tag(xml, 'resultCode');
    var resultMsg = tag(xml, 'resultMsg');

    // data.go.kr 은 인증키 오류도 HTTP 200 + 에러코드로 돌려준다
    if (resultCode && resultCode !== '00' && resultCode !== '0') {
      return res.status(502).json({
        configured: true,
        error: 'KEITI API 오류',
        resultCode: resultCode,
        resultMsg: resultMsg
      });
    }

    var items = blocks(xml, 'dataEL').map(normalizeItem);
    var totalCount = Number(tag(xml, 'totalCount') || items.length || 0);

    var payload = {
      configured: true,
      source: '한국환경산업기술원 (KEITI)',
      dataset: '환경표지인증 해지·취소 제품 조회',
      query: query,
      // 이 데이터셋은 "해지·취소된 것"만 담고 있다.
      // 따라서 조회 결과가 있으면 = 해지/취소 이력 있음 = 무효.
      revoked: totalCount > 0,
      totalCount: totalCount,
      matches: items,
      checkedAt: new Date().toISOString()
    };

    cache.set(query, { at: Date.now(), payload: payload });
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(502).json({
      configured: true,
      error: 'KEITI API 호출 실패: ' + (err && err.message ? err.message : String(err))
    });
  }
};
