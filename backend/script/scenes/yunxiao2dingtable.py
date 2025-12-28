# 常量定义
API_HOST = 'openapi-rdc.aliyuncs.com'
ORGANIZATION_ID = '6141c43fdd62cdb60fbbdbda'
URL_BASE = f'https://{API_HOST}/oapi/v1/projex/organizations/{ORGANIZATION_ID}'
REQUEST_HEADERS = {
    'Content-Type': 'application/json',
    'x-yunxiao-token': 'pt-czzZf5WTrnMlb28d0JnxPuGl_f91654ce-db2c-4db5-8b2d-95abebee7654',
}
PROJECT_ID_MAP = {
    '线上问题流程控制': '263ab83ebfec6437fcda2c8ce1',
    'KA项目迭代管理': '8e86f38936cb02dc00a8ac450e',
    '算账高手': 'a685a602eb0ca1da20d5d1dc99',
    '数据接入':  'b74de3f45942f13789dc17d96e',
    '行情高手':  '9c7928d189f931a9c9d63f7980',
}
CATEGORY_LIST = 'Req，Task，Bug'.split('，')
