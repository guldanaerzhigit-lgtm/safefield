pluginManagement {
    repositories {
        google()
        maven("https://maven.aliyun.com/repository/google")
        mavenCentral()
        maven("https://maven.aliyun.com/repository/public")
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        maven("https://maven.aliyun.com/repository/google")
        mavenCentral()
        maven("https://maven.aliyun.com/repository/public")
    }
}
rootProject.name = "SafeFieldAndroid"
include(":app")
