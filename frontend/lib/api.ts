import { getSession, signOut } from "next-auth/react";

// 获取 API URL
// 如果 NEXT_PUBLIC_API_URL 为空或未设置，使用相对路径（通过 nginx 代理）
const getApiUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  
  // 如果环境变量为空或未设置，使用相对路径（通过 nginx 代理）
  if (!envUrl || envUrl.trim() === "") {
    return "";
  }
  
  if (typeof window !== "undefined") {
    // 客户端（浏览器）：直接使用环境变量，不进行替换
    // 生产环境应该通过 nginx 代理，使用相对路径（空字符串）
    // 开发环境可以设置完整的 URL
    return envUrl;
  }
  
  // 服务端：可以使用 Docker 内部网络名称
  // 如果环境变量包含 localhost，在服务端替换为 backend（Docker 内部网络）
  if (envUrl.includes("localhost")) {
    return envUrl.replace(/localhost/g, "backend");
  }
  return envUrl;
};

// 使用函数而不是直接赋值，确保在运行时获取正确的 URL
const getApiUrlValue = () => getApiUrl();

/**
 * 扩展的 Session 类型，包含 accessToken
 */
interface ExtendedSession {
  accessToken?: string;
}

/**
 * 获取带认证头的 fetch 配置
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  try {
    const session = await getSession();
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    const extendedSession = session as ExtendedSession | null;
    if (extendedSession?.accessToken) {
      headers["Authorization"] = `Bearer ${extendedSession.accessToken}`;
    } else {
      console.warn("未找到 accessToken，请求可能失败");
    }

    return headers;
  } catch (error) {
    console.error("获取认证头失败:", error);
    return {
      "Content-Type": "application/json",
    };
  }
}

/**
 * 处理 401 未授权错误 - 自动登出并跳转到登录页
 */
async function handleUnauthorized() {
  // 只在客户端执行
  if (typeof window !== "undefined") {
    console.warn("认证失败，正在跳转到登录页...");
    // 清除 session 并跳转到登录页
    await signOut({ 
      callbackUrl: "/auth/signin",
      redirect: true 
    });
  }
}

/**
 * 处理 API 响应
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = "操作失败";
    
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.detail || errorMessage;
    } catch {
      errorMessage = errorText || errorMessage;
    }
    
    // 如果是 401 未授权，自动登出并跳转到登录页
    if (response.status === 401) {
      await handleUnauthorized();
      errorMessage = "认证失败，请重新登录";
    }
    
    // 如果是 413 Payload Too Large，提示用户数据太大
    if (response.status === 413) {
      errorMessage = "数据太大，超过了 100MB 的限制。请减少数据量后重试。";
    }
    
    throw new Error(errorMessage);
  }

  // 204 No Content 响应没有 body
  if (response.status === 204) {
    return null as T;
  }

  return response.json();
}

/**
 * 项目相关 API
 */
export interface Project {
  id: number;
  project_id: string;
  name: string;
  description?: string;
  owner_id: number;
  created_at: string;
  updated_at?: string;
}

export interface ProjectCreate {
  name: string;
  description?: string;
  project_id?: string;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
}

export interface Job {
  id: number;
  name: string;
  path: string;
  description?: string;
  owner_id: number;
  project_id: number;
  created_at: string;
  updated_at?: string;
}

// Option 相关类型
export interface OptionCreate {
  option_type: "text" | "date" | "number" | "file" | "credential";
  name: string;
  display_name?: string;
  description?: string;
  default_value?: string;
  required?: boolean;
  credential_type?: string; // 凭证类型（当option_type为credential时使用）
}

// Step 相关类型
export interface StepCreate {
  order: number;
  step_type: "command" | "shell_script" | "python_script";
  extension: Record<string, any>;
}

// Notification 相关类型
export interface NotificationCreate {
  trigger: "on_start" | "on_success" | "on_failure" | "on_retryable_fail" | "average_duration_exceeded";
  notification_type: "webhook" | "dingtalk_webhook";
  extensions: Record<string, any>;
}

// Option 响应类型
export interface OptionResponse {
  id: number;
  option_type: "text" | "date" | "number" | "file" | "credential";
  name: string;
  display_name?: string;
  description?: string;
  default_value?: string;
  required: boolean;
  credential_type?: string; // 凭证类型（当option_type为credential时使用）
}

// Step 响应类型
export interface StepResponse {
  id: number;
  order: number;
  step_type: "command" | "shell_script" | "python_script";
  extension: Record<string, any>;
}

// Notification 响应类型
export interface NotificationResponse {
  trigger: "on_start" | "on_success" | "on_failure" | "on_retryable_fail" | "average_duration_exceeded";
  notification_type: "webhook" | "dingtalk_webhook";
  extensions: Record<string, any>;
}

// Workflow 相关类型
export interface WorkflowCreate {
  name: string;
  timeout?: number; // 超时时间（分钟）
  retry?: number; // 重试次数
  node_type?: "local" | "remote";
  schedule_enabled?: boolean; // 是否定时工具
  schedule_crontab?: string; // 定时工具规则
  schedule_timezone?: string; // 时区
  options?: OptionCreate[]; // 参数列表
  steps?: StepCreate[]; // 步骤列表
  notifications?: NotificationCreate[]; // 通知规则列表
}

export interface WorkflowResponse {
  id: number;
  name: string;
  timeout?: number; // 超时时间（分钟）
  retry: number;
  node_type: "local" | "remote";
  schedule_enabled: boolean;
  schedule_crontab?: string;
  schedule_timezone: string;
  notifications?: NotificationResponse[];
  options: OptionResponse[];
  steps: StepResponse[];
}

export interface JobCreate {
  name: string;
  path: string;
  description?: string;
  project_id: number;
  workflow?: WorkflowCreate;
}

export interface JobUpdate {
  name?: string;
  path?: string;
  description?: string;
  workflow?: WorkflowCreate;
}

export interface OwnerInfo {
  id: number;
  username: string;
  nickname?: string;
}

export interface JobDetail {
  id: number;
  name: string;
  path: string;
  description?: string;
  owner_id: number;
  owner?: OwnerInfo;
  project_id: number;
  created_at: string;
  updated_at?: string;
  workflow?: WorkflowResponse;
}

export const jobApi = {
  /**
   * 获取工具列表
   */
  async getAll(projectId?: number): Promise<Job[]> {
    try {
      const headers = await getAuthHeaders();
      const apiUrl = getApiUrlValue();
      const url = projectId 
        ? `${apiUrl}/api/jobs?project_id=${projectId}`
        : `${apiUrl}/api/jobs`;
      
      const response = await fetch(url, {
        method: "GET",
        headers,
        credentials: "include",
      });
      
      return handleResponse<Job[]>(response);
    } catch (error) {
      console.error("API 请求错误:", error);
      if (error instanceof TypeError) {
        if (error.message === "Failed to fetch") {
          const apiUrl = getApiUrlValue();
          const errorMessage = error.cause 
            ? `网络连接失败: ${error.cause}。请检查：\n1. 后端服务是否运行 (${apiUrl})\n2. 网络连接是否正常\n3. CORS 配置是否正确`
            : `无法连接到服务器 (${apiUrl})，请检查后端服务是否运行`;
          throw new Error(errorMessage);
        }
      }
      throw error;
    }
  },

  /**
   * 获取单个工具
   */
  async getById(id: number): Promise<Job> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/jobs/${id}`, {
      method: "GET",
      headers,
    });
    return handleResponse<Job>(response);
  },

  /**
   * 获取工具详情（包含工作流信息）
   */
  async getDetailById(id: number): Promise<JobDetail> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/jobs/${id}/detail`, {
      method: "GET",
      headers,
    });
    return handleResponse<JobDetail>(response);
  },

  /**
   * 创建工具
   */
  async create(data: JobCreate): Promise<Job> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/jobs`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
    return handleResponse<Job>(response);
  },

  /**
   * 更新工具
   */
  async update(id: number, data: JobUpdate): Promise<Job> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/jobs/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(data),
    });
    return handleResponse<Job>(response);
  },

  /**
   * 删除工具
   */
  async delete(id: number): Promise<void> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/jobs/${id}`, {
      method: "DELETE",
      headers,
    });
    return handleResponse<void>(response);
  },

  /**
   * 运行工具
   */
  async run(id: number, args?: Record<string, any>): Promise<{ output: string; result: any; error?: string }> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/jobs/${id}/run`, {
      method: "POST",
      headers,
      body: JSON.stringify({ args: args || {} }),
    });
    return handleResponse<{ output: string; result: any; error?: string }>(response);
  },

  /**
   * 测试 Python 脚本
   */
  async testScript(script: string, args?: Record<string, any>): Promise<{ output: string; error?: string }> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/jobs/test-script`, {
      method: "POST",
      headers,
      body: JSON.stringify({ script, args: args || {} }),
    });
    return handleResponse<{ output: string; error?: string }>(response);
  },
};

// 执行记录相关类型
export interface JobExecution {
  id: number;
  job_id: number;
  user_id: number;
  execution_type: "manual" | "scheduled";
  status: "success" | "failure";
  args?: Record<string, any>;
  output_text?: string;
  output_dataset?: any; // 数据详情（TOP10条）
  error_message?: string;
  executed_at: string;
  created_at: string;
  updated_at?: string;
  job_name?: string;
  user_username?: string;
  user_nickname?: string;
}

// 凭证相关类型
export interface Credential {
  id: number;
  project_id: number;
  credential_type: "mysql" | "oss" | "deepseek";
  name: string;
  description?: string;
  config: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

export interface CredentialCreate {
  credential_type: "mysql" | "oss" | "deepseek";
  name: string;
  description?: string;
  config: Record<string, any>;
}

export interface CredentialUpdate {
  credential_type?: "mysql" | "oss" | "deepseek";
  name?: string;
  description?: string;
  config?: Record<string, any>;
}

export const executionApi = {
  /**
   * 获取执行记录列表
   */
  async getAll(params?: {
    job_id?: number;
    status?: "success" | "failure";
    execution_type?: "manual" | "scheduled";
    limit?: number;
    offset?: number;
  }): Promise<JobExecution[]> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const queryParams = new URLSearchParams();
    
    if (params?.job_id) {
      queryParams.append("job_id", params.job_id.toString());
    }
    if (params?.status) {
      queryParams.append("status_filter", params.status);
    }
    if (params?.execution_type) {
      queryParams.append("execution_type", params.execution_type);
    }
    if (params?.limit) {
      queryParams.append("limit", params.limit.toString());
    }
    if (params?.offset) {
      queryParams.append("offset", params.offset.toString());
    }
    
    const url = `${apiUrl}/api/executions${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
    const response = await fetch(url, {
      method: "GET",
      headers,
    });
    return handleResponse<JobExecution[]>(response);
  },

  /**
   * 获取单个执行记录详情
   */
  async getById(id: number): Promise<JobExecution> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/executions/${id}`, {
      method: "GET",
      headers,
    });
    return handleResponse<JobExecution>(response);
  },
};

export const projectApi = {
  /**
   * 获取所有项目
   */
  async getAll(): Promise<Project[]> {
    try {
      const headers = await getAuthHeaders();
      const apiUrl = getApiUrlValue();
      const url = `${apiUrl}/api/projects`;
      console.log("请求 URL:", url);
      console.log("请求头:", headers);
      
      const response = await fetch(url, {
        method: "GET",
        headers,
        credentials: "include", // 包含 cookies
      });
      
      console.log("响应状态:", response.status, response.statusText);
      
      return handleResponse<Project[]>(response);
    } catch (error) {
      console.error("API 请求错误:", error);
      if (error instanceof TypeError) {
        if (error.message === "Failed to fetch") {
          const apiUrl = getApiUrlValue();
          // 检查是否是网络错误
          const errorMessage = error.cause 
            ? `网络连接失败: ${error.cause}。请检查：\n1. 后端服务是否运行 (${apiUrl})\n2. 网络连接是否正常\n3. CORS 配置是否正确`
            : `无法连接到服务器 (${apiUrl})，请检查后端服务是否运行`;
          throw new Error(errorMessage);
        }
      }
      throw error;
    }
  },

  /**
   * 获取单个项目
   */
  async getById(id: number): Promise<Project> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/projects/${id}`, {
      method: "GET",
      headers,
    });
    return handleResponse<Project>(response);
  },

  /**
   * 创建项目
   */
  async create(data: ProjectCreate): Promise<Project> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/projects`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
    return handleResponse<Project>(response);
  },

  /**
   * 更新项目
   */
  async update(id: number, data: ProjectUpdate): Promise<Project> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/projects/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(data),
    });
    return handleResponse<Project>(response);
  },

  /**
   * 删除项目
   */
  async delete(id: number): Promise<void> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/projects/${id}`, {
      method: "DELETE",
      headers,
    });
    return handleResponse<void>(response);
  },

  /**
   * 获取项目的关联用户列表
   */
  async getUsers(projectId: number): Promise<User[]> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/projects/${projectId}/users`, {
      method: "GET",
      headers,
    });
    return handleResponse<User[]>(response);
  },

  /**
   * 为项目添加关联用户
   */
  async addUsers(projectId: number, userIds: number[]): Promise<User[]> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/projects/${projectId}/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({ user_ids: userIds }),
    });
    return handleResponse<User[]>(response);
  },

  /**
   * 从项目移除关联用户
   */
  async removeUser(projectId: number, userId: number): Promise<void> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/projects/${projectId}/users/${userId}`, {
      method: "DELETE",
      headers,
    });
    return handleResponse<void>(response);
  },
};

/**
 * 凭证相关 API
 */
export const credentialApi = {
  /**
   * 获取凭证列表
   */
  async getAll(params?: { project_id?: number; credential_type?: string }): Promise<Credential[]> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const queryParams = new URLSearchParams();
    if (params?.project_id) {
      queryParams.append("project_id", params.project_id.toString());
    }
    if (params?.credential_type) {
      queryParams.append("credential_type", params.credential_type);
    }
    const url = `${apiUrl}/api/credentials${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
    const response = await fetch(url, {
      method: "GET",
      headers,
    });
    return handleResponse<Credential[]>(response);
  },

  /**
   * 获取单个凭证
   */
  async getById(id: number): Promise<Credential> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/credentials/${id}`, {
      method: "GET",
      headers,
    });
    return handleResponse<Credential>(response);
  },

  /**
   * 创建凭证
   */
  async create(projectId: number, data: CredentialCreate): Promise<Credential> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/credentials?project_id=${projectId}`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
    return handleResponse<Credential>(response);
  },

  /**
   * 更新凭证
   */
  async update(id: number, data: CredentialUpdate): Promise<Credential> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/credentials/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(data),
    });
    return handleResponse<Credential>(response);
  },

  /**
   * 删除凭证
   */
  async delete(id: number): Promise<void> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/credentials/${id}`, {
      method: "DELETE",
      headers,
    });
    return handleResponse<void>(response);
  },
};

// 用户相关类型
export interface User {
  id: number;
  username: string;
  email?: string;
  nickname?: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at?: string;
}

export interface UserCreate {
  username: string;
  email?: string;
  nickname?: string;
  password: string;
}

export interface UserUpdate {
  username?: string;
  email?: string;
  nickname?: string;
  password?: string;
  is_active?: boolean;
  is_admin?: boolean;
}

/**
 * 文件上传相关 API
 */
export const uploadApi = {
  /**
   * 上传文件
   */
  async upload(file: File): Promise<{ path: string; name: string; size: number }> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    
    // 文件上传需要使用 FormData，不能使用 JSON
    const formData = new FormData();
    formData.append("file", file);
    
    // 移除 Content-Type，让浏览器自动设置（包含 boundary）
    const uploadHeaders: HeadersInit = {};
    const session = await getSession();
    const extendedSession = session as ExtendedSession | null;
    if (extendedSession?.accessToken) {
      uploadHeaders["Authorization"] = `Bearer ${extendedSession.accessToken}`;
    }
    
    const response = await fetch(`${apiUrl}/api/upload`, {
      method: "POST",
      headers: uploadHeaders,
      body: formData,
    });
    return handleResponse<{ path: string; name: string; size: number }>(response);
  },
};

export const userApi = {
  /**
   * 获取所有用户
   */
  async getAll(): Promise<User[]> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/users`, {
      method: "GET",
      headers,
    });
    return handleResponse<User[]>(response);
  },

  /**
   * 获取单个用户
   */
  async getById(id: number): Promise<User> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/users/${id}`, {
      method: "GET",
      headers,
    });
    return handleResponse<User>(response);
  },

  /**
   * 创建用户
   */
  async create(data: UserCreate): Promise<User> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/users`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
    return handleResponse<User>(response);
  },

  /**
   * 更新用户
   */
  async update(id: number, data: UserUpdate): Promise<User> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/users/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(data),
    });
    return handleResponse<User>(response);
  },

  /**
   * 删除用户
   */
  async delete(id: number): Promise<void> {
    const headers = await getAuthHeaders();
    const apiUrl = getApiUrlValue();
    const response = await fetch(`${apiUrl}/api/users/${id}`, {
      method: "DELETE",
      headers,
    });
    return handleResponse<void>(response);
  },
};

