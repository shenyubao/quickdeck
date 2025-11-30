"use client";

import { Typography } from "antd";

export default function Dashboard() {
  return (
    <div>
      <Typography.Title level={3}>任务清单</Typography.Title>
      <Typography.Paragraph>
        这里是任务清单的内容区域
      </Typography.Paragraph>
    </div>
  );
}

