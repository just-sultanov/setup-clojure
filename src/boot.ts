import * as core from '@actions/core'
import * as io from '@actions/io'
import * as tc from '@actions/tool-cache'
import * as exec from '@actions/exec'
import * as path from 'path'
import * as os from 'os'
import * as fs from './fs'
import * as utils from './utils'

function getTempDirectory(): string {
  let tempDirectory = process.env['RUNNER_TEMP'] || ''

  if (!tempDirectory) {
    let baseLocation
    if (utils.isWindows()) {
      baseLocation = process.env['USERPROFILE'] || 'C:\\'
    } else {
      if (process.platform === 'darwin') {
        baseLocation = '/Users'
      } else {
        baseLocation = '/home'
      }
    }
    tempDirectory = path.join(baseLocation, 'actions', 'temp')
  }
  return tempDirectory
}

export async function setup(
  version: string,
  githubAuth?: string
): Promise<void> {
  let toolPath = tc.find(
    'Boot',
    utils.getCacheVersionString(version),
    os.arch()
  )

  if (toolPath && version !== 'latest') {
    core.info(`Boot found in cache ${toolPath}`)
  } else {
    const bootBootstrapFile = await tc.downloadTool(
      `https://github.com/boot-clj/boot-bin/releases/download/latest/boot.sh`,
      undefined,
      githubAuth
    )
    const tempDir: string = path.join(
      getTempDirectory(),
      `temp_${Math.floor(Math.random() * 2000000000)}`
    )
    const bootDir = await installBoot(bootBootstrapFile, tempDir, version)
    core.debug(`Boot installed to ${bootDir}`)
    toolPath = await tc.cacheDir(
      bootDir,
      'Boot',
      utils.getCacheVersionString(version)
    )
  }

  core.exportVariable('BOOT_HOME', toolPath)
  if (version !== 'latest') {
    core.exportVariable('BOOT_VERSION', version)
  }
  core.addPath(path.join(toolPath, 'bin'))
}

async function installBoot(
  binScript: string,
  destinationFolder: string,
  version: string
): Promise<string> {
  await io.mkdirP(destinationFolder)

  const bin = path.normalize(binScript)
  const binStats = await fs.stat(bin)
  if (binStats.isFile()) {
    const binDir = path.join(destinationFolder, 'boot', 'bin')

    await io.mkdirP(binDir)

    await io.mv(bin, path.join(binDir, `boot`))
    await fs.chmod(path.join(binDir, `boot`), '0755')

    let env: {[key: string]: string} = {}
    if (version === 'latest') {
      env = {
        BOOT_HOME: path.join(destinationFolder, 'boot')
      }
    } else {
      env = {
        BOOT_HOME: path.join(destinationFolder, 'boot'),
        BOOT_VERSION: version
      }
    }

    if (process.env['PATH']) {
      env['PATH'] = process.env['PATH']
    }
    if (process.env['JAVA_CMD']) {
      env['JAVA_CMD'] = process.env['JAVA_CMD']
    }

    await exec.exec(`./boot ${version === 'latest' ? '-u' : '-V'}`, [], {
      cwd: path.join(destinationFolder, 'boot', 'bin'),
      env
    })

    return path.join(destinationFolder, 'boot')
  } else {
    throw new Error('Not a file')
  }
}
