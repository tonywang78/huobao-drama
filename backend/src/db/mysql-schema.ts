import type { Pool } from 'mysql2/promise'

export const mysqlSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS dramas (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    genre TEXT,
    style VARCHAR(64) DEFAULT '3d',
    aspect_ratio VARCHAR(16) DEFAULT '16:9',
    total_episodes INT DEFAULT 1,
    total_duration INT DEFAULT 0,
    status VARCHAR(64) NOT NULL DEFAULT 'draft',
    thumbnail TEXT,
    tags TEXT,
    metadata TEXT,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    deleted_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS episodes (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    drama_id INT NOT NULL,
    episode_number INT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    script_content TEXT,
    description TEXT,
    duration INT DEFAULT 0,
    status VARCHAR(64) DEFAULT 'draft',
    video_url TEXT,
    thumbnail TEXT,
    image_config_id INT,
    video_config_id INT,
    img2img_config_id INT,
    first_last_config_id INT,
    resolution VARCHAR(16) DEFAULT '720p',
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    deleted_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS characters (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    drama_id INT NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    description TEXT,
    appearance TEXT,
    styling TEXT,
    final_prompt TEXT,
    personality TEXT,
    image_url TEXT,
    reference_images TEXT,
    seed_value TEXT,
    sort_order INT,
    local_path TEXT,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    deleted_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS scenes (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    drama_id INT NOT NULL,
    episode_id INT,
    location TEXT NOT NULL,
    time VARCHAR(64) NOT NULL,
    prompt TEXT NOT NULL,
    lighting TEXT,
    final_prompt TEXT,
    storyboard_count INT DEFAULT 1,
    image_url TEXT,
    status VARCHAR(64) DEFAULT 'pending',
    local_path TEXT,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    deleted_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS storyboards (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    episode_id INT NOT NULL,
    scene_id INT,
    storyboard_number INT NOT NULL,
    title TEXT,
    location TEXT,
    time VARCHAR(64),
    shot_type TEXT,
    angle TEXT,
    movement TEXT,
    result TEXT,
    atmosphere TEXT,
    shot_style VARCHAR(32) DEFAULT 'default',
    image_prompt TEXT,
    video_prompt TEXT,
    first_last_prompt TEXT,
    first_frame_prompt TEXT,
    last_frame_prompt TEXT,
    bgm_prompt TEXT,
    sound_effect TEXT,
    description TEXT,
    duration INT DEFAULT 0,
    composed_image TEXT,
    first_frame_image TEXT,
    last_frame_image TEXT,
    reference_images TEXT,
    video_url TEXT,
    subtitle_url TEXT,
    composed_video_url TEXT,
    status VARCHAR(64) DEFAULT 'pending',
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    deleted_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS episode_characters (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    episode_id INT NOT NULL,
    character_id INT NOT NULL,
    created_at VARCHAR(64) NOT NULL,
    INDEX idx_episode_characters_episode_id (episode_id),
    INDEX idx_episode_characters_character_id (character_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS episode_scenes (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    episode_id INT NOT NULL,
    scene_id INT NOT NULL,
    created_at VARCHAR(64) NOT NULL,
    INDEX idx_episode_scenes_episode_id (episode_id),
    INDEX idx_episode_scenes_scene_id (scene_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS episode_props (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    episode_id INT NOT NULL,
    prop_id INT NOT NULL,
    created_at VARCHAR(64) NOT NULL,
    INDEX idx_episode_props_episode_id (episode_id),
    INDEX idx_episode_props_prop_id (prop_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS storyboard_characters (
    storyboard_id INT NOT NULL,
    character_id INT NOT NULL,
    PRIMARY KEY (storyboard_id, character_id),
    INDEX idx_storyboard_characters_character_id (character_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS storyboard_props (
    storyboard_id INT NOT NULL,
    prop_id INT NOT NULL,
    PRIMARY KEY (storyboard_id, prop_id),
    INDEX idx_storyboard_props_prop_id (prop_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ai_service_configs (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    service_type VARCHAR(64) NOT NULL,
    provider VARCHAR(64),
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    model TEXT,
    endpoint TEXT,
    query_endpoint TEXT,
    priority INT DEFAULT 0,
    is_default TINYINT(1) DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    settings TEXT,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ai_service_providers (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name TEXT NOT NULL,
    display_name TEXT,
    service_type VARCHAR(64) NOT NULL,
    provider VARCHAR(64) NOT NULL,
    default_url TEXT,
    preset_models TEXT,
    description TEXT,
    is_active TINYINT(1) DEFAULT 1,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS style_presets (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    value VARCHAR(64) NOT NULL,
    prompt TEXT NOT NULL,
    description TEXT,
    sort_order INT DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    UNIQUE KEY uk_style_presets_value (value)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS sys_task (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(16) NOT NULL,
    storyboard_id INT,
    drama_id INT,
    scene_id INT,
    character_id INT,
    prop_id INT,
    provider VARCHAR(64),
    prompt TEXT,
    model TEXT,
    params TEXT,
    task_id TEXT,
    result_url TEXT,
    local_path TEXT,
    status VARCHAR(64) DEFAULT 'processing',
    error_msg TEXT,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    completed_at VARCHAR(64),
    INDEX idx_sys_task_type (type),
    INDEX idx_sys_task_drama_id (drama_id),
    INDEX idx_sys_task_storyboard_id (storyboard_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS video_merges (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    episode_id INT,
    drama_id INT,
    title TEXT,
    provider VARCHAR(64) NOT NULL,
    model TEXT NOT NULL,
    status VARCHAR(64) DEFAULT 'pending',
    scenes TEXT,
    merged_url TEXT,
    duration INT,
    task_id TEXT,
    error_msg TEXT,
    created_at VARCHAR(64) NOT NULL,
    completed_at VARCHAR(64),
    deleted_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS props (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    drama_id INT NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    description TEXT,
    prompt TEXT,
    final_prompt TEXT,
    image_url TEXT,
    reference_images TEXT,
    local_path TEXT,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    deleted_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS assets (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    drama_id INT,
    episode_id INT,
    storyboard_id INT,
    storyboard_num INT,
    name TEXT,
    description TEXT,
    type TEXT,
    category TEXT,
    url TEXT,
    thumbnail_url TEXT,
    local_path TEXT,
    file_size INT,
    mime_type TEXT,
    width INT,
    height INT,
    duration INT,
    format TEXT,
    image_gen_id INT,
    video_gen_id INT,
    is_favorite TINYINT(1) DEFAULT 0,
    view_count INT DEFAULT 0,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    deleted_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS assistant_threads (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    drama_id INT,
    episode_id INT,
    title VARCHAR(128),
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    INDEX idx_assistant_threads_episode (episode_id),
    INDEX idx_assistant_threads_drama (drama_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS assistant_messages (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    thread_id INT NOT NULL,
    role VARCHAR(16) NOT NULL,
    content TEXT,
    created_at VARCHAR(64) NOT NULL,
    INDEX idx_assistant_messages_thread (thread_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS assistant_snippets (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    drama_id INT,
    title VARCHAR(128) NOT NULL,
    body TEXT NOT NULL,
    asset_type VARCHAR(16) NULL,
    system_key VARCHAR(64) NULL,
    sort_order INT DEFAULT 0,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    INDEX idx_assistant_snippets_drama (drama_id),
    UNIQUE KEY uk_assistant_snippets_system_key (system_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]

/**
 * 风格预设种子数据 — value 存入 dramas.style，prompt 注入生图提示词
 */
export const stylePresetSeeds = [
  { name: '3D 漫剧', value: '3d', sortOrder: 1, prompt: '3D CG animation style, game-engine quality render, semi-realistic stylized characters, refined facial features, detailed materials and textures, cinematic lighting, high detail', description: '游戏引擎级 3D 渲染，半写实角色，当前短剧主流的 3D 漫剧质感' },
  { name: '日漫赛璐璐', value: 'anime', sortOrder: 2, prompt: 'Japanese anime style, cel shading, clean crisp line art, vivid saturated colors, expressive character designs, detailed painted backgrounds', description: '日式赛璐璐动画风格' },
  { name: '吉卜力手绘', value: 'ghibli', sortOrder: 3, prompt: 'Studio Ghibli style, hand-drawn animation, soft watercolor painted backgrounds, warm nostalgic lighting, gentle natural palette, whimsical cozy atmosphere', description: '吉卜力手绘治愈风' },
  { name: '水彩绘本', value: 'watercolor', sortOrder: 4, prompt: 'watercolor illustration style, soft translucent washes, visible paper texture, delicate fluid brushwork, light airy atmosphere, hand-painted storybook feel', description: '水彩插画质感' },
  { name: '美式漫画', value: 'comic', sortOrder: 5, prompt: 'Western comic book style, bold black ink outlines, halftone dot shading, dynamic saturated colors, dramatic contrast lighting, flat graphic novel look', description: '美式漫画粗线条风格' },
  { name: '真人电影感', value: 'live-action', sortOrder: 6, prompt: 'cinematic live-action drama style, photorealistic actors, film lighting and color grading, shallow depth of field, natural skin texture, movie still quality, believable wardrobe and locations', description: '真人影视剧质感，电影光影与景深，适合短剧真人向' },
  { name: '超写实摄影', value: 'photorealistic', sortOrder: 7, prompt: 'ultra photorealistic photography, sharp optical detail, natural skin pores and microtexture, accurate materials and reflections, realistic lighting, commercial photo quality, no illustration look', description: '接近广告/写真摄影的超真实感' },
  { name: '皮克斯 3D', value: 'pixar', sortOrder: 8, prompt: 'Pixar-style 3D animation, stylized appealing characters, soft subsurface scattering, clean vibrant colors, expressive eyes, polished family-animation render, warm cinematic lighting', description: '迪士尼/皮克斯式卡通 3D' },
  { name: '国风工笔', value: 'guofeng', sortOrder: 9, prompt: 'traditional Chinese gongbi and ink-wash illustration style, elegant fine linework, classical mineral pigment palette, refined brush details, poetic atmosphere, East Asian classical aesthetics', description: '中国风工笔/水墨插画' },
  { name: '赛博朋克', value: 'cyberpunk', sortOrder: 10, prompt: 'cyberpunk neon noir style, rain-soaked streets, vivid neon signs and holograms, high-tech low-life atmosphere, volumetric fog, cinematic sci-fi contrast, futuristic urban detail', description: '霓虹霓雾科幻都市' },
  { name: '黑白线稿', value: 'sketch', sortOrder: 11, prompt: 'black and white pencil sketch style, clean confident line art, cross-hatching shading, storyboard sketch feel, monochrome graphite on paper, unfinished raw drawing aesthetic', description: '黑白素描/分镜线稿感' },
  { name: '油画质感', value: 'oil-painting', sortOrder: 12, prompt: 'classical oil painting style, visible brushstrokes, rich impasto texture, layered pigment depth, dramatic Rembrandt lighting, gallery fine-art look, painterly canvas grain', description: '古典油画笔触与厚涂' },
]

/**
 * 资产图生图常用提示词种子 — system_key 幂等；不覆盖用户已改 title/body
 */
export const assistantSnippetSeeds = [
  {
    systemKey: 'character.standardize',
    assetType: 'character',
    title: '标准化',
    sortOrder: 1,
    body: '角色设定参考图，左侧为正脸特写，右侧并列展示正面、90 度侧面、背面三张等高全身视图，特写与全身视图都是同一角色，全身入镜，中性 A 字站姿，三张全身视图等高并排、头顶脚底对齐',
  },
  {
    systemKey: 'scene.fixed_view',
    assetType: 'scene',
    title: '固定视角',
    sortOrder: 1,
    body: '场景设定参考图，固定机位与构图，保持空间布局、道具摆放与光照方向一致，环境细节清晰可读，无人物抢戏',
  },
  {
    systemKey: 'prop.white_bg',
    assetType: 'prop',
    title: '白底单品',
    sortOrder: 1,
    body: '道具设定参考图，纯白背景，单件居中，完整入镜，材质与细节清晰，无多余道具与人物',
  },
]

// INSERT ... SELECT WHERE NOT EXISTS → 幂等：只补缺失行，不覆盖用户编辑，
// 且不会像 INSERT IGNORE 那样在每次启动时白白消耗自增 id
export const mysqlDataSeedStatements = [
  ...stylePresetSeeds.map((s) => ({
    sql: 'INSERT INTO `style_presets` (`name`, `value`, `prompt`, `description`, `sort_order`, `is_active`, `created_at`, `updated_at`) SELECT ?, ?, ?, ?, ?, 1, ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `style_presets` WHERE `value` = ?)',
    params: [s.name, s.value, s.prompt, s.description, s.sortOrder, new Date().toISOString(), new Date().toISOString(), s.value],
  })),
  ...assistantSnippetSeeds.map((s) => ({
    sql: 'INSERT INTO `assistant_snippets` (`drama_id`, `title`, `body`, `asset_type`, `system_key`, `sort_order`, `created_at`, `updated_at`) SELECT NULL, ?, ?, ?, ?, ?, ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `assistant_snippets` WHERE `system_key` = ?)',
    params: [s.title, s.body, s.assetType, s.systemKey, s.sortOrder, new Date().toISOString(), new Date().toISOString(), s.systemKey],
  })),
]

/** 已有库增量补丁：CREATE TABLE IF NOT EXISTS 不会给旧表加列 */
export const mysqlSchemaPatches = [
  'ALTER TABLE `episodes` ADD COLUMN `img2img_config_id` INT NULL AFTER `video_config_id`',
  'ALTER TABLE `episodes` ADD COLUMN `first_last_config_id` INT NULL AFTER `img2img_config_id`',
  'ALTER TABLE `storyboards` ADD COLUMN `first_last_prompt` TEXT NULL AFTER `video_prompt`',
  'ALTER TABLE `storyboards` ADD COLUMN `first_frame_prompt` TEXT NULL AFTER `first_last_prompt`',
  'ALTER TABLE `storyboards` ADD COLUMN `last_frame_prompt` TEXT NULL AFTER `first_frame_prompt`',
  'ALTER TABLE `storyboards` ADD COLUMN `shot_style` VARCHAR(32) DEFAULT \'default\' AFTER `atmosphere`',
  'ALTER TABLE `assistant_snippets` ADD COLUMN `asset_type` VARCHAR(16) NULL AFTER `body`',
  'ALTER TABLE `assistant_snippets` ADD COLUMN `system_key` VARCHAR(64) NULL AFTER `asset_type`',
  'ALTER TABLE `assistant_snippets` ADD UNIQUE KEY `uk_assistant_snippets_system_key` (`system_key`)',
]

async function applySchemaPatches(pool: Pool) {
  for (const sql of mysqlSchemaPatches) {
    try {
      await pool.query(sql)
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      // 列已存在 / 索引已存在 → 幂等跳过
      if (code === 'ER_DUP_FIELDNAME' || code === 'ER_DUP_KEYNAME') continue
      throw err
    }
  }
}

export async function initMySqlSchema(pool: Pool) {
  for (const statement of mysqlSchemaStatements) {
    await pool.query(statement)
  }
  await applySchemaPatches(pool)
  for (const seed of mysqlDataSeedStatements) {
    await pool.query(seed.sql, seed.params)
  }
}
