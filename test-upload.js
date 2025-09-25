// 测试上传功能的简单脚本
const fs = require('fs');

// 模拟插件的上传功能
async function testUpload() {
    const serverUrl = 'http://localhost:8888';
    
    // 读取测试文章
    const content = fs.readFileSync('./test-article.md', 'utf8');
    
    // 解析frontmatter和内容
    const lines = content.split('\n');
    let frontmatterEnd = -1;
    let frontmatter = {};
    
    if (lines[0] === '---') {
        for (let i = 1; i < lines.length; i++) {
            if (lines[i] === '---') {
                frontmatterEnd = i;
                break;
            }
            const [key, ...valueParts] = lines[i].split(':');
            if (key && valueParts.length > 0) {
                const value = valueParts.join(':').trim();
                let cleanValue = value.replace(/^["']|["']$/g, '');
        // 处理数组格式的tags
        if (key.trim() === 'tags' && cleanValue.startsWith('[') && cleanValue.endsWith(']')) {
            cleanValue = cleanValue.slice(1, -1); // 移除方括号
        }
        frontmatter[key.trim()] = cleanValue;
            }
        }
    }
    
    const articleContent = lines.slice(frontmatterEnd + 1).join('\n').trim();
    
    // 构建请求数据
    const postData = {
        title: frontmatter.title || '测试文章',
        content: articleContent,
        excerpt: frontmatter.excerpt || articleContent.substring(0, 200),
        category_id: parseInt(frontmatter.category) || 1,
        status: "published" // 设置为已发布状态
    };
    
    console.log('准备上传的数据:', JSON.stringify(postData, null, 2));
    
    try {
        const response = await fetch(`${serverUrl}/api/v1/admin/posts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(postData)
        });
        
        console.log('响应状态:', response.status, response.statusText);
        
        const responseText = await response.text();
        console.log('响应内容:', responseText);
        
        if (response.ok) {
            const result = JSON.parse(responseText);
            console.log('上传成功:', result);
        } else {
            console.error('上传失败:', responseText);
        }
        
    } catch (error) {
        console.error('请求错误:', error.message);
    }
}

// 运行测试
testUpload();