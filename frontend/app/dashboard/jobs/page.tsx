"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Button, Typography, Spin } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { projectApi, jobApi, type Project } from "@/lib/api";
import JobForm from "./components/JobForm";

const { Title } = Typography;

export default function NewJobPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("id");
  
  console.log("组件渲染，jobId:", jobId);
  
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [jobDetail, setJobDetail] = useState<any>(null);
  const [loadingJobDetail, setLoadingJobDetail] = useState(false);

  // 获取当前项目
  const currentProject = useMemo(() => {
    if (typeof window === "undefined") return null;
    const projectName = localStorage.getItem("currentProject");
    if (!projectName) return null;
    return projects.find((p) => p.name === projectName) || null;
  }, [projects]);

  // 加载项目列表
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setLoading(true);
        const data = await projectApi.getAll();
        setProjects(data);
      } catch (error) {
        console.error("加载项目列表失败:", error);
      } finally {
        setLoading(false);
      }
    };
    loadProjects();
  }, []);

  // 如果是编辑模式，加载任务详情
  useEffect(() => {
    console.log("useEffect 执行，jobId:", jobId);
    const loadJobDetail = async () => {
      console.log("loadJobDetail 开始执行，jobId:", jobId);
      if (!jobId) {
        console.log("jobId 为空，不加载任务详情");
        setJobDetail(null);
        return;
      }
      
      try {
        console.log("开始加载任务详情，jobId:", jobId);
        setLoadingJobDetail(true);
        const detail = await jobApi.getDetailById(parseInt(jobId));
        console.log("任务详情加载完成:", detail);
        console.log("owner 信息:", detail?.owner);
        setJobDetail(detail);
      } catch (error) {
        console.error("加载任务详情失败:", error);
        setJobDetail(null);
      } finally {
        setLoadingJobDetail(false);
      }
    };
    
    loadJobDetail();
  }, [jobId]);


  // 如果没有项目，提示用户先创建项目
  if (!loading && projects.length === 0) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: "50px 0" }}>
          <Title level={4}>请先创建项目</Title>
          <p>在创建任务之前，您需要先创建一个项目。</p>
          <Button
            type="primary"
            onClick={() => router.push("/dashboard/projects")}
          >
            前往项目管理
          </Button>
        </div>
      </Card>
    );
  }

  // 如果没有当前项目，提示选择项目
  if (!loading && !currentProject && projects.length > 0) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: "50px 0" }}>
          <Title level={4}>请先选择项目</Title>
          <p>请在顶部导航栏选择一个项目，然后再创建任务。</p>
          <Button onClick={() => router.push("/dashboard")}>
            返回任务清单
          </Button>
        </div>
      </Card>
    );
  }


  return (
    <div>
      {/* 标题和返回按钮 - 放在同一行 */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        marginBottom: "24px" 
      }}>
        <div>
          <Title level={3} style={{ margin: 0, marginBottom: "8px" }}>
            {jobId ? "编辑任务" : "新建任务"}
          </Title>
          {/* 显示负责人信息 */}
          {(() => {
            console.log("渲染负责人信息，jobId:", jobId, "jobDetail:", jobDetail, "owner:", jobDetail?.owner);
            if (jobId && jobDetail && jobDetail.owner) {
              return (
                <div style={{ marginTop: "4px" }}>
                  <Typography.Text type="secondary" style={{ fontSize: "14px" }}>
                    负责人: {jobDetail.owner.nickname || jobDetail.owner.username}
                  </Typography.Text>
                </div>
              );
            }
            return null;
          })()}
        </div>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push("/dashboard")}
        >
          返回
        </Button>
      </div>
      
      <Spin spinning={loading || loadingJobDetail}>
        {currentProject ? (
          <JobForm
            jobId={jobId ? parseInt(jobId) : null}
            currentProject={currentProject}
          />
        ) : null}
      </Spin>
    </div>
  );
}

