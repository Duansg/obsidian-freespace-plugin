import {App, Notice, Plugin, PluginSettingTab, requestUrl, Setting, TFile} from 'obsidian';

// Plugin Settings Interface
interface FreespacePluginSettings {
    serverUrl: string;
    username: string;
    password: string;
    autoSync: boolean;
}

// Default settings
const DEFAULT_SETTINGS: FreespacePluginSettings = {
    serverUrl: 'http://localhost:8240',
    username: '',
    password: '',
    autoSync: false
}
const grayMatter = require('gray-matter');

// Article Data Interface
interface PostData {
    title: string;
    content: string;
    excerpt: string;
    status: string; // draft, published, archived
}

export default class FreespacePlugin extends Plugin {
    settings: FreespacePluginSettings;

    async onload() {
        await this.loadSettings();

        // Sync command
        this.addCommand({
            id: 'sync-current-file',
            name: '同步当前文件到Freespace',
            callback: () => {
                this.syncCurrentFile();
            }
        });

        // Sync all files command
        this.addCommand({
            id: 'sync-all-files',
            name: '同步所有文件到Freespace',
            callback: () => {
                this.syncAllFiles();
            }
        });

        // Test connection command
        this.addCommand({
            id: 'test-connection',
            name: '测试服务器连接',
            callback: () => {
                this.testConnection();
            }
        });

        // Setting tab
        this.addSettingTab(new FreespaceSettingTab(this.app, this));

        /**
         * If automatic synchronization is enabled, listen for file saving events
         * todo 重复生成的问题
         */
        if (this.settings.autoSync) {
            this.registerEvent(
                this.app.vault.on('modify', (file) => {
                    if (file instanceof TFile && file.extension === 'md') {
                        this.syncFile(file);
                    }
                })
            );
        }
    }

    onunload() {
        // todo clear
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    /**
     * Test Connection
     * https://forum.obsidian.md/t/make-http-requests-from-plugins/15461/15
     */
    async testConnection() {
        try {
            // const response = await requestUrl({url: "https://weatherapi/forecast", headers})
            const response = await requestUrl(`${this.settings.serverUrl}/api/test/connection`)
            if (response.status == 200) {
                new Notice('服务器连接成功！');
            } else {
                console.error('连接测试失败:', response.status, response.text);
                new Notice(`服务器连接失败: HTTP ${response.status} - ${response.text}`);
            }
        } catch (error) {
            console.error('连接测试异常:', error);
            new Notice(`服务器连接失败: ${error.message}`);
        }
    }

    // Synchronize the current file
    async syncCurrentFile() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('没有活动文件');
            return;
        }
        if (activeFile.extension !== 'md') {
            new Notice('只能同步Markdown文件');
            return;
        }
        await this.syncFile(activeFile);
    }

    // Synchronize all Markdown files
    async syncAllFiles() {
        const files = this.app.vault.getMarkdownFiles();
        let successCount = 0;
        let errorCount = 0;

        new Notice('开始批量同步...');

        for (const file of files) {
            try {
                await this.syncFile(file);
                successCount++;
            } catch (error) {
                errorCount++;
                console.error(`同步文件 ${file.path} 失败:`, error);
            }
        }

        new Notice(`同步完成: ${successCount} 成功, ${errorCount} 失败`);
    }

    // Synchronize a single file
    async syncFile(file: TFile) {
        try {
            const content = await this.app.vault.read(file);
            const postData = this.parseMarkdownContent(content, file.basename);

            // 文件完整路径，例如 "notes/tech/typescript.md"
            const fullPath = file.path;
            // 父级目录：去掉最后一个 `/` 后的部分
            const parentFolder = fullPath.substring(0, fullPath.lastIndexOf("/"));
            console.log(parentFolder)
            await this.uploadToServer(postData);
            new Notice(`文件 ${file.name} 同步成功`);
        } catch (error) {
            new Notice(`文件 ${file.name} 同步失败: ${error.message}`);
            console.error('同步失败:', error);
        }
    }

    // Parse the Markdown content
    parseMarkdownContent(content: string, filename: string): PostData {
        // 解析文件内容
        const matterResult = grayMatter(content);
        console.log("Duansg:" + matterResult)
        console.log("Duansg:" + matterResult.data.title)
        console.log("Duansg:" + matterResult.data.excerpt)
        console.log("Duansg:" + matterResult.data.status)
        return {
            title:  matterResult.data.title,
            content: matterResult.content,
            excerpt: matterResult.data.excerpt,
            status: matterResult.data.status // todo 判空，默认草稿
        };
    }

    async uploadToServer(postData: PostData): Promise<any> {
        const url = `${this.settings.serverUrl}/api/v1/admin/article/create`;

        const requestBody = {
            title: postData.title,
            content: postData.content,
            excerpt: postData.excerpt,
            status: postData.status
        };

        console.log('=== 开始上传文章 ===');
        console.log('目标URL:', url);
        console.log('请求数据:', requestBody);

        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        // 如果设置了API密钥，添加认证头
        if (this.settings.username && this.settings.password) {
            const token = Buffer.from(`${this.settings.username}:${this.settings.password}`).toString('base64');
            headers['Authorization'] = `Basic ${token}`;
        }

        try {
            const response = await requestUrl({
                url: url,
                method: "POST",
                headers: headers,
                body: JSON.stringify(requestBody)
            })
            console.log('收到响应 - 状态:', response.status);
            console.log('响应头:', response.headers);

            if (response.status == 200) {
                console.log('上传成功 - 服务器响应:', response.text);
                console.log('=== 上传完成 ===');
                return;
            } else {
                let errorMessage = `HTTP ${response.status}`;
                let errorDetails = '';
                try {
                    const errorData = await response.json();
                    console.log('错误响应数据:', errorData);
                    errorMessage = errorData.message || errorMessage;
                    errorDetails = JSON.stringify(errorData);
                } catch (parseError) {
                    console.log('无法解析错误响应为JSON，尝试获取文本');
                    try {
                        errorDetails = response.text;
                        console.log('错误响应文本:', errorDetails);
                        errorMessage = errorDetails || errorMessage;
                    } catch (textError) {
                        console.error('无法获取错误响应内容:', textError);
                    }
                }
                console.error('上传失败:', errorMessage);
                throw new Error(`${errorMessage}${errorDetails ? ' - ' + errorDetails : ''}`);
            }
        } catch (error) {
            console.error('=== 上传异常 ===');
            console.error('错误类型:', error.constructor.name);
            console.error('错误消息:', error.message);
            console.error('错误堆栈:', error.stack);
            // 检查是否是网络错误
            if (error.message.includes('fetch')) {
                console.error('这可能是网络连接问题');
            }
            throw error;
        }
    }
}

// Tab Settings
class FreespaceSettingTab extends PluginSettingTab {
    plugin: FreespacePlugin;

    constructor(app: App, plugin: FreespacePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        containerEl.createEl('h2', {text: 'Freespace 插件设置'});

        new Setting(containerEl)
            .setName('服务器地址')
            .setDesc('Freespace服务器的URL地址')
            .addText(text => text
                .setPlaceholder('http://localhost:8240')
                .setValue(this.plugin.settings.serverUrl)
                .onChange(async (value) => {
                    this.plugin.settings.serverUrl = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('用户名')
            .setDesc('Freespace服务器用于认证的用户名')
            .addText(text => text
                .setPlaceholder('admin')
                .setValue(this.plugin.settings.username)
                .onChange(async (value) => {
                    this.plugin.settings.username = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('密码')
            .setDesc('Freespace服务器用于认证的密码')
            .addText(text => text
                .setPlaceholder('admin')
                .setValue(this.plugin.settings.password)
                .onChange(async (value) => {
                    this.plugin.settings.password = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('自动同步')
            .setDesc('文件保存时自动同步到Freespace服务器')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSync)
                .onChange(async (value) => {
                    this.plugin.settings.autoSync = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('测试连接')
            .setDesc('测试与Freespace服务器的连接')
            .addButton(button => button
                .setButtonText('测试连接')
                .setCta()
                .onClick(async () => {
                    await this.plugin.testConnection();
                }));
    }
}