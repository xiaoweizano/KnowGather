import type { DocumentRecord, TiptapDocument } from '../../../shared/document'
import { normalizeDocumentJson } from '../../../shared/document'

const demoContent = {
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": {
        "level": 1
      },
      "content": [
        {
          "type": "text",
          "text": "一、产品定位"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "拾知是一款专注于个人知识管理的桌面应用，致力于帮助用户更好地记录、组织与连接知识。我们希望编辑文档像写下脑海中的想法一样自然。"
        }
      ]
    },
    {
      "type": "blockquote",
      "content": [
        {
          "type": "paragraph",
          "content": [
            {
              "type": "text",
              "text": "核心理念"
            }
          ]
        },
        {
          "type": "paragraph",
          "content": [
            {
              "type": "text",
              "text": "简单、高效、有温度，让知识管理变得更轻松。"
            }
          ]
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 1
      },
      "content": [
        {
          "type": "text",
          "text": "二、核心功能"
        }
      ]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "所见即所得的编辑体验，支持 Markdown 输入"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "结构化知识模块，支持问题、方案、任务等"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "强大的知识关联，构建个人知识网络"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "AI 助手加持，智能总结与问答"
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "编辑器优先保证输入体验：中文输入法组合期间不打断选区，回车排版稳定，撤销重做与粘贴行为保持可预期。"
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 1
      },
      "content": [
        {
          "type": "text",
          "text": "三、未来规划"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "我们将持续打磨产品体验，扩展更多实用功能，让拾知成为你最可靠的知识伙伴。"
        }
      ]
    },
    {
      "type": "horizontalRule"
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "这是一段用于体验选中、格式化和评论浮层的正文。你可以尝试选中它，然后在工具栏中调整格式。"
        }
      ]
    }
  ]
} as TiptapDocument

export const DEMO_DOCUMENTS: DocumentRecord[] = [
  {
  "id": "doc-shizhi-design",
  "title": "拾知产品设计思路",
  "tags": [
    "产品设计",
    "思考",
    "重要"
  ],
  "content": {
    "type": "doc",
    "content": [
      {
        "type": "heading",
        "attrs": {
          "level": 1
        },
        "content": [
          {
            "type": "text",
            "text": "一、产品定位"
          }
        ]
      },
      {
        "type": "paragraph",
        "content": [
          {
            "type": "text",
            "text": "拾知是一款专注于个人知识管理的桌面应用，致力于帮助用户更好地记录、组织与连接知识。我们希望编辑文档像写下脑海中的想法一样自然。"
          }
        ]
      },
      {
        "type": "blockquote",
        "content": [
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "核心理念"
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "简单、高效、有温度，让知识管理变得更轻松。"
              }
            ]
          }
        ]
      },
      {
        "type": "heading",
        "attrs": {
          "level": 1
        },
        "content": [
          {
            "type": "text",
            "text": "二、核心功能"
          }
        ]
      },
      {
        "type": "bulletList",
        "content": [
          {
            "type": "listItem",
            "content": [
              {
                "type": "paragraph",
                "content": [
                  {
                    "type": "text",
                    "text": "所见即所得的编辑体验，支持 Markdown 输入"
                  }
                ]
              }
            ]
          },
          {
            "type": "listItem",
            "content": [
              {
                "type": "paragraph",
                "content": [
                  {
                    "type": "text",
                    "text": "结构化知识模块，支持问题、方案、任务等"
                  }
                ]
              }
            ]
          },
          {
            "type": "listItem",
            "content": [
              {
                "type": "paragraph",
                "content": [
                  {
                    "type": "text",
                    "text": "强大的知识关联，构建个人知识网络"
                  }
                ]
              }
            ]
          },
          {
            "type": "listItem",
            "content": [
              {
                "type": "paragraph",
                "content": [
                  {
                    "type": "text",
                    "text": "AI 助手加持，智能总结与问答"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "type": "paragraph",
        "content": [
          {
            "type": "text",
            "text": "编辑器优先保证输入体验：中文输入法组合期间不打断选区，回车排版稳定，撤销重做与粘贴行为保持可预期。"
          }
        ]
      },
      {
        "type": "heading",
        "attrs": {
          "level": 1
        },
        "content": [
          {
            "type": "text",
            "text": "三、未来规划"
          }
        ]
      },
      {
        "type": "paragraph",
        "content": [
          {
            "type": "text",
            "text": "我们将持续打磨产品体验，扩展更多实用功能，让拾知成为你最可靠的知识伙伴。"
          }
        ]
      },
      {
        "type": "horizontalRule"
      },
      {
        "type": "paragraph",
        "content": [
          {
            "type": "text",
            "text": "这是一段用于体验选中、格式化和评论浮层的正文。你可以尝试选中它，然后在工具栏中调整格式。"
          }
        ]
      }
    ]
  },
  "revision": 0,
  "version": 1,
  "createdAt": "2026-11-11T07:24:00.000Z",
  "updatedAt": "2026-11-11T07:24:00.000Z",
  "deletedAt": null
},
  {
  "id": "doc-tiptap-optimize",
  "title": "Tiptap 编辑器优化方案",
  "tags": [
    "技术笔记",
    "编辑器"
  ],
  "content": {
    "type": "doc",
    "content": [
      {
        "type": "heading",
        "attrs": {
          "level": 1
        },
        "content": [
          {
            "type": "text",
            "text": "输入体验优先"
          }
        ]
      },
      {
        "type": "paragraph",
        "content": [
          {
            "type": "text",
            "text": "围绕中文输入法、回车排版、选区、撤销重做与粘贴建立可回归的编辑器能力。"
          }
        ]
      }
    ]
  },
  "revision": 0,
  "version": 1,
  "createdAt": "2026-11-11T07:24:00.000Z",
  "updatedAt": "2026-11-11T07:24:00.000Z",
  "deletedAt": null
},
  {
  "id": "doc-2026-plan",
  "title": "2026 年工作计划",
  "tags": [
    "计划"
  ],
  "content": {
    "type": "doc",
    "content": [
      {
        "type": "heading",
        "attrs": {
          "level": 1
        },
        "content": [
          {
            "type": "text",
            "text": "年度目标"
          }
        ]
      },
      {
        "type": "paragraph",
        "content": [
          {
            "type": "text",
            "text": "持续构建个人知识体系，并完成拾知编辑器的体验打磨。"
          }
        ]
      },
      {
        "type": "taskList",
        "content": [
          {
            "type": "taskItem",
            "attrs": {
              "checked": true
            },
            "content": [
              {
                "type": "paragraph",
                "content": [
                  {
                    "type": "text",
                    "text": "完成编辑器基础架构"
                  }
                ]
              }
            ]
          },
          {
            "type": "taskItem",
            "attrs": {
              "checked": false
            },
            "content": [
              {
                "type": "paragraph",
                "content": [
                  {
                    "type": "text",
                    "text": "完善结构化内容模块"
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  "revision": 0,
  "version": 1,
  "createdAt": "2026-11-11T07:24:00.000Z",
  "updatedAt": "2026-11-11T07:24:00.000Z",
  "deletedAt": null
},
  {
  "id": "doc-travel",
  "title": "旅行计划与攻略",
  "tags": [
    "生活随笔"
  ],
  "content": {
    "type": "doc",
    "content": [
      {
        "type": "heading",
        "attrs": {
          "level": 1
        },
        "content": [
          {
            "type": "text",
            "text": "旅行计划"
          }
        ]
      },
      {
        "type": "paragraph",
        "content": [
          {
            "type": "text",
            "text": "去看山海，也记录沿途的想法。"
          }
        ]
      }
    ]
  },
  "revision": 0,
  "version": 1,
  "createdAt": "2026-11-11T07:24:00.000Z",
  "updatedAt": "2026-11-11T07:24:00.000Z",
  "deletedAt": null
},
  {
  "id": "doc-problems",
  "title": "问题与解决方案汇总",
  "tags": [
    "工作笔记"
  ],
  "content": {
    "type": "doc",
    "content": [
      {
        "type": "heading",
        "attrs": {
          "level": 1
        },
        "content": [
          {
            "type": "text",
            "text": "问题记录"
          }
        ]
      },
      {
        "type": "paragraph",
        "content": [
          {
            "type": "text",
            "text": "把遇到问题和对应方案沉淀为可检索的知识。"
          }
        ]
      }
    ]
  },
  "revision": 0,
  "version": 1,
  "createdAt": "2026-11-11T07:24:00.000Z",
  "updatedAt": "2026-11-11T07:24:00.000Z",
  "deletedAt": null
}
]

export const DEFAULT_DOCUMENT: DocumentRecord = {
  ...DEMO_DOCUMENTS[0]!,
  content: normalizeDocumentJson(demoContent),
}
