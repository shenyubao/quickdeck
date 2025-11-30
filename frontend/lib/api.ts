import { getSession, signOut } from "next-auth/react";

// 在浏览器环境中，API URL 必须是 localhost，而不是 Docker 内部网络名称
// 因为浏览器无法解析 Docker 内部主机名（如 backend）
const getApiUrl = () => {
  if (typeof window !== "undefined") {
    // 客户端（浏览器）：强制使用 localhost
    // 即使环境变量设置了 backend:8000，在浏览器中也必须使用 localhost
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    if (envUrl && envUrl.includes("backend")) {
      // 如果环境变量包含 backend，替换为 localhost
      return envUrl.replace(/backend/g, "localhost");
    }
    return envUrl || "http://localhost:8000";
  }
  // 服务端：可以使用 Docker 内部网络名称
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
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
};

