"use client";

import { useState, useEffect } from "react";
import {
  Typography,
  Table,
  Tag,
  Space,
  Select,
  Button,
  Card,
  Modal,
  Descriptions,
  Spin,
  message,
  Empty,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  UserOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { executionApi, jobApi, type JobExecution, type Job } from "@/lib/api";

// 日期格式化函数（完整格式，用于列表）
const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// 日期格式化函数（短格式，用于弹窗）
const formatDateTimeShort = (dateString: string) => {
  const date = new Date(dateString);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
};

const { Title } = Typography;
const { Option } = Select;

// 渲染数据详情表格的辅助函数
const renderDatasetTable = (dataset: any) => {
  if (!dataset) {
    return <span style={{ color: "#999" }}>无数据</span>;
  }

  // 如果是数组
  if (Array.isArray(dataset)) {
    if (dataset.length === 0) {
      return <span style={{ color: "#999" }}>无数据</span>;
    }

    // 如果数组中的元素是对象
    if (dataset[0] && typeof dataset[0] === "object" && !Array.isArray(dataset[0])) {
      const columns = Object.keys(dataset[0]).map((key) => ({
        title: key,
        dataIndex: key,
        key: key,
        width: 150,
        ellipsis: true,
        render: (text: any) => {
          if (text === null || text === undefined) return "-";
          if (typeof text === "object") {
            return <span style={{ wordBreak: "break-word" }} title={JSON.stringify(text)}>{JSON.stringify(text)}</span>;
          }
          return <span style={{ wordBreak: "break-word" }} title={String(text)}>{String(text)}</span>;
        },
      }));

      return (
        <div className="table-container-wrapper" style={{ width: "100%", maxWidth: "100%", overflow: "auto" }}>
          <Table
            columns={columns}
            dataSource={dataset.map((item, index) => ({ ...item, key: index }))}
            pagination={false}
            size="small"
            scroll={{ x: true }}
            bordered
          />
        </div>
      );
    } else {
      // 如果是简单数组
      const columns = [
        { title: "序号", dataIndex: "index", key: "index", width: 80 },
        {
          title: "值",
          dataIndex: "value",
          key: "value",
          ellipsis: true,
          render: (text: any) => {
            if (text === null || text === undefined) return "-";
            if (typeof text === "object") return <span style={{ wordBreak: "break-word" }}>{JSON.stringify(text)}</span>;
            return <span style={{ wordBreak: "break-word" }}>{String(text)}</span>;
          },
        },
      ];

      return (
        <div className="table-container-wrapper" style={{ width: "100%", maxWidth: "100%", overflow: "auto" }}>
          <Table
            columns={columns}
            dataSource={dataset.map((item, index) => ({ index: index + 1, value: item, key: index }))}
            pagination={false}
            size="small"
            scroll={{ x: true }}
            bordered
          />
        </div>
      );
    }
  }

  // 如果是对象
  if (typeof dataset === "object") {
    const columns = [
      { title: "键", dataIndex: "key", key: "key", width: 200 },
      {
        title: "值",
        dataIndex: "value",
        key: "value",
        ellipsis: true,
        render: (text: any) => {
          if (text === null || text === undefined) return "-";
          if (typeof text === "object") {
            const jsonStr = JSON.stringify(text, null, 2);
            return <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }} title={jsonStr}>{jsonStr}</pre>;
          }
          return <span style={{ wordBreak: "break-word" }} title={String(text)}>{String(text)}</span>;
        },
      },
    ];

    const dataSource = Object.entries(dataset).map(([key, value]) => ({ key, value }));

    return (
      <div className="table-container-wrapper" style={{ width: "100%", maxWidth: "100%", overflow: "auto" }}>
        <Table
          columns={columns}
          dataSource={dataSource}
          pagination={false}
          size="small"
          scroll={{ x: true }}
          bordered
        />
      </div>
    );
  }

  // 其他类型，直接显示
  return (
    <div style={{ 
      background: "#f5f5f5", 
      padding: "12px", 
      borderRadius: "4px",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    }}>
      {String(dataset)}
    </div>
  );
};

export default function HistoryPage() {
  const [loading, setLoading] = useState(false);
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
  });
  const [filters, setFilters] = useState<{
    job_id?: number;
    status?: "success" | "failure";
    execution_type?: "manual" | "scheduled";
  }>({});
  const [selectedExecution, setSelectedExecution] = useState<JobExecution | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // 检测是否为移动设备
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 确保表格容器宽度不超出父容器
  useEffect(() => {
    if (detailModalVisible) {
      setTimeout(() => {
        const descriptionsItemContent = document.querySelector('.ant-descriptions-item-content');
        const tableContainers = document.querySelectorAll('.table-container-wrapper');
        
        if (descriptionsItemContent) {
          const maxWidth = descriptionsItemContent.clientWidth;
          tableContainers.forEach((container) => {
            const htmlContainer = container as HTMLElement;
            htmlContainer.style.setProperty('max-width', `${maxWidth}px`, 'important');
            htmlContainer.style.setProperty('width', `${maxWidth}px`, 'important');
          });
        }
      }, 100);
    }
  }, [detailModalVisible, selectedExecution]);

  // 加载工具列表
  useEffect(() => {
    const loadJobs = async () => {
      try {
        const data = await jobApi.getAll();
        setJobs(data);
      } catch (error) {
        console.error("加载工具列表失败:", error);
      }
    };
    loadJobs();
  }, []);

  // 加载执行记录
  const loadExecutions = async () => {
    try {
      setLoading(true);
      const data = await executionApi.getAll({
        ...filters,
        limit: pagination.pageSize,
        offset: (pagination.current - 1) * pagination.pageSize,
      });
      setExecutions(data);
      // 注意：API 没有返回总数，这里假设返回的数据长度就是总数
      // 如果实际API返回了总数，应该使用返回的总数
      setTotal(data.length);
    } catch (error: any) {
      console.error("加载执行记录失败:", error);
      message.error(error.message || "加载执行记录失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExecutions();
  }, [pagination, filters]);

  // 处理筛选变化
  const handleFilterChange = (key: string, value: any) => {
    setFilters((prev) => {
      const newFilters = { ...prev };
      if (value === undefined || value === null || value === "") {
        delete newFilters[key as keyof typeof newFilters];
      } else {
        (newFilters as any)[key] = value;
      }
      return newFilters;
    });
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  // 查看详情
  const handleViewDetail = async (execution: JobExecution) => {
    try {
      const detail = await executionApi.getById(execution.id);
      setSelectedExecution(detail);
      setDetailModalVisible(true);
    } catch (error: any) {
      message.error(error.message || "加载详情失败");
    }
  };

  // 表格列定义
  const columns = [
    {
      title: "执行时间",
      dataIndex: "executed_at",
      key: "executed_at",
      width: isMobile ? 140 : 260,
      render: (text: string) => (
        <Space size="small">
          {!isMobile && <ClockCircleOutlined />}
          <span style={{ fontSize: isMobile ? '12px' : '14px' }}>
            {isMobile ? formatDateTimeShort(text) : formatDateTime(text)}
          </span>
        </Space>
      ),
      sorter: true,
    },
    {
      title: "工具名称",
      dataIndex: "job_name",
      key: "job_name",
      width: isMobile ? 120 : 200,
      render: (text: string, record: JobExecution) => (
        <Button
          type="link"
          onClick={() => handleViewDetail(record)}
          style={{ padding: 0, fontSize: isMobile ? '12px' : '14px' }}
        >
          {text || `工具 #${record.job_id}`}
        </Button>
      ),
    },
    ...(!isMobile ? [{
      title: "执行人",
      dataIndex: "user_nickname",
      key: "user",
      width: 120,
      render: (text: string, record: JobExecution) => (
        <Space>
          <UserOutlined />
          <span>{text || record.user_username || `用户 #${record.user_id}`}</span>
        </Space>
      ),
    }] : []),
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: isMobile ? 70 : 100,
      render: (status: string) => (
        <Tag
          icon={!isMobile && (status === "success" ? <CheckCircleOutlined /> : <CloseCircleOutlined />)}
          color={status === "success" ? "success" : "error"}
          style={{ fontSize: isMobile ? '11px' : '13px' }}
        >
          {status === "success" ? "成功" : "失败"}
        </Tag>
      ),
    },
    ...(!isMobile ? [{
      title: "执行方式",
      dataIndex: "execution_type",
      key: "execution_type",
      width: 100,
      render: (type: string) => (
        <Tag color={type === "manual" ? "blue" : "purple"}>
          {type === "manual" ? "手动" : "定时工具"}
        </Tag>
      ),
    }] : []),
    ...(!isMobile ? [{
      title: "输出",
      dataIndex: "output_text",
      key: "output_text",
      ellipsis: true,
      render: (text: string) => {
        if (!text) return <span style={{ color: "#999" }}>无输出</span>;
        const preview = text.length > 100 ? text.substring(0, 100) + "..." : text;
        return <span>{preview}</span>;
      },
    }] : []),
    {
      title: "操作",
      key: "action",
      width: isMobile ? 60 : 100,
      render: (_: any, record: JobExecution) => (
        <Button
          type="link"
          icon={<FileTextOutlined />}
          onClick={() => handleViewDetail(record)}
          size={isMobile ? 'small' : 'middle'}
          style={{ padding: isMobile ? 0 : undefined }}
        >
          {!isMobile && "详情"}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: isMobile ? 16 : 24 }}>
        <Title level={3} style={{ fontSize: isMobile ? '18px' : '24px' }}>执行记录</Title>
      </div>

      <Card>
        {/* 筛选区域 */}
        <Space style={{ marginBottom: 16, flexWrap: "wrap", width: '100%' }} size={isMobile ? 'small' : 'middle'}>
          <span style={{ fontSize: isMobile ? '13px' : '14px' }}>工具：</span>
          <Select
            style={{ width: isMobile ? 120 : 200 }}
            size={isMobile ? 'middle' : 'middle'}
            placeholder="全部工具"
            allowClear
            value={filters.job_id}
            onChange={(value) => handleFilterChange("job_id", value)}
          >
            {jobs.map((job) => (
              <Option key={job.id} value={job.id}>
                {job.name}
              </Option>
            ))}
          </Select>

          <span style={{ fontSize: isMobile ? '13px' : '14px' }}>状态：</span>
          <Select
            style={{ width: isMobile ? 90 : 120 }}
            size={isMobile ? 'middle' : 'middle'}
            placeholder="全部状态"
            allowClear
            value={filters.status}
            onChange={(value) => handleFilterChange("status", value)}
          >
            <Option value="success">成功</Option>
            <Option value="failure">失败</Option>
          </Select>

          {!isMobile && (
            <>
              <span>执行方式：</span>
              <Select
                style={{ width: 120 }}
                placeholder="全部方式"
                allowClear
                value={filters.execution_type}
                onChange={(value) => handleFilterChange("execution_type", value)}
              >
                <Option value="manual">手动</Option>
                <Option value="scheduled">定时工具</Option>
              </Select>
            </>
          )}

          <Button
            icon={<ReloadOutlined />}
            onClick={loadExecutions}
            size={isMobile ? 'middle' : 'middle'}
          >
            {!isMobile && "刷新"}
          </Button>
        </Space>

        {/* 表格 */}
        <Table
          columns={columns}
          dataSource={executions}
          rowKey="id"
          loading={loading}
          size={isMobile ? 'small' : 'middle'}
          scroll={{ x: isMobile ? 500 : undefined }}
          pagination={{
            ...pagination,
            total,
            showSizeChanger: !isMobile,
            showTotal: (total) => isMobile ? `共${total}条` : `共 ${total} 条记录`,
            size: isMobile ? 'small' : 'default',
            simple: isMobile,
            onChange: (page, pageSize) => {
              setPagination({ current: page, pageSize });
            },
          }}
          locale={{
            emptyText: <Empty description="暂无执行记录" />,
          }}
        />
      </Card>

      {/* 详情模态框 */}
      <Modal
        title="执行记录详情"
        open={detailModalVisible}
        onCancel={() => {
          setDetailModalVisible(false);
          setSelectedExecution(null);
        }}
        footer={[
          <Button key="close" onClick={() => {
            setDetailModalVisible(false);
            setSelectedExecution(null);
          }}>
            关闭
          </Button>,
        ]}
        width={isMobile ? '100%' : 1000}
        style={{ maxWidth: isMobile ? "100vw" : "90vw", top: isMobile ? 0 : undefined }}
        styles={{
          body: { maxWidth: "100%", overflow: "hidden" },
        }}
      >
        {selectedExecution && (
          <div style={{ width: "100%", maxWidth: "100%", overflow: "hidden" }}>
            <style>{`
              .ant-descriptions-item-content {
                max-width: 100% !important;
                overflow: hidden !important;
              }
              .ant-descriptions-view {
                table-layout: fixed !important;
              }
              .table-container-wrapper {
                width: 100% !important;
                max-width: 100% !important;
                overflow-x: auto !important;
              }
            `}</style>
            <Descriptions 
              bordered 
              column={isMobile ? 1 : 2}
              size={isMobile ? 'small' : 'middle'}
              styles={{ label: { width: isMobile ? "80px" : "120px", minWidth: isMobile ? "80px" : "120px" } }}
            >
              <Descriptions.Item label="执行时间">
                {formatDateTime(selectedExecution.executed_at)}
              </Descriptions.Item>
              <Descriptions.Item label="工具名称">
                {selectedExecution.job_name || `工具 #${selectedExecution.job_id}`}
              </Descriptions.Item>
              <Descriptions.Item label="执行人">
                {selectedExecution.user_nickname || selectedExecution.user_username || `用户 #${selectedExecution.user_id}`}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag
                  icon={selectedExecution.status === "success" ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                  color={selectedExecution.status === "success" ? "success" : "error"}
                >
                  {selectedExecution.status === "success" ? "成功" : "失败"}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="执行方式" span={isMobile ? 1 : 2}>
                <Tag color={selectedExecution.execution_type === "manual" ? "blue" : "purple"}>
                  {selectedExecution.execution_type === "manual" ? "手动" : "定时任务"}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="错误信息" span={isMobile ? 1 : 2}>
                {selectedExecution.error_message || "无"}
              </Descriptions.Item>
              <Descriptions.Item label="入参" span={isMobile ? 1 : 2}>
                <pre style={{ 
                  background: "#f5f5f5", 
                  padding: isMobile ? "8px" : "12px", 
                  borderRadius: "4px",
                  maxHeight: isMobile ? "150px" : "200px",
                  overflow: "auto",
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: isMobile ? "11px" : "13px",
                }}>
                  {JSON.stringify(selectedExecution.args || {}, null, 2)}
                </pre>
              </Descriptions.Item>
              <Descriptions.Item label="输出文本" span={isMobile ? 1 : 2}>
                <div style={{ 
                  background: "#f5f5f5", 
                  padding: isMobile ? "8px" : "12px", 
                  borderRadius: "4px",
                  maxHeight: isMobile ? "200px" : "300px",
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: isMobile ? "11px" : "13px",
                }}>
                  {selectedExecution.output_text || "无输出"}
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="数据详情（TOP10）" span={isMobile ? 1 : 2}>
                {renderDatasetTable(selectedExecution.output_dataset)}
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>
    </div>
  );
}
