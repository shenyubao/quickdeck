# 示例1：加法
# 入参: {"a": "1", "b": "2"}
# 出参: {"result": "3", "dataset": None}
def execute(args: dict) -> tuple:
    a = args.get("a")
    b = args.get("b")
    print(a+b)
    return (str(int(a) + int(b)), None)