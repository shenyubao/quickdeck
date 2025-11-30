"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Button, Typography, Spin } from "antd";
import { projectApi, type Project } from "@/lib/api";
import JobForm from "./components/JobForm";

const { Title } = Typography;

export default function NewJobPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("id");
  
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

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
      <Spin spinning={loading}>
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

